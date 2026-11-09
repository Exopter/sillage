# syntax=docker/dockerfile:1
# check=error=true

# Production image for Kamal deploys.
ARG RUBY_VERSION=4.0.9
FROM docker.io/library/node:24-bookworm-slim AS frontend
WORKDIR /frontend
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY script/prepare_cesium_assets.mjs script/prepare_three_assets.mjs script/prepare_leaflet_assets.mjs script/
RUN npm run assets:prepare

FROM docker.io/library/ruby:$RUBY_VERSION-slim AS base

WORKDIR /rails

RUN apt-get update -qq && \
    apt-get upgrade -y && \
    apt-get install --no-install-recommends -y curl ffmpeg libjemalloc2 postgresql-client && \
    ln -s /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

ENV RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_JOBS="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_RETRY="3" \
    BUNDLE_WITHOUT="development:test" \
    LD_PRELOAD="/usr/local/lib/libjemalloc.so"

FROM base AS build

RUN apt-get update -qq && \
    apt-get upgrade -y && \
    apt-get install --no-install-recommends -y build-essential git libpq-dev libyaml-dev pkg-config && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

COPY Gemfile Gemfile.lock ./

RUN bundle install && \
    rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git && \
    bundle exec bootsnap precompile -j 1 --gemfile

COPY . .
COPY --from=frontend /frontend/public/vendor/cesium /rails/public/vendor/cesium
COPY --from=frontend /frontend/public/vendor/leaflet /rails/public/vendor/leaflet
COPY --from=frontend /frontend/public/vendor/three /rails/public/vendor/three
COPY --from=frontend /frontend/public/vendor/feedback /rails/public/vendor/feedback

RUN bundle exec bootsnap precompile -j 1 app/ lib/
RUN SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile

FROM base

RUN groupadd --system --gid 1000 rails && \
    useradd rails --uid 1000 --gid 1000 --create-home --shell /bin/bash

COPY --chown=rails:rails --from=build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --chown=rails:rails --from=build /rails /rails

# Reuse the locked JSON gem for standalone Ruby and remove the base image's
# vulnerable copy from the standard library and default gem registry.
RUN <<'SH'
set -eu
json_gem=$(bundle show json)
json_name=${json_gem##*/}
bundle_home=${json_gem%/gems/*}
extension=$(find "$bundle_home/extensions" -type d -name "$json_name" -print -quit)
test -n "$extension"
gem_extension="$GEM_HOME/${extension#"$bundle_home/"}"
mkdir -p "$GEM_HOME/gems" "$GEM_HOME/specifications" "${gem_extension%/*}"
ln -s "$json_gem" "$GEM_HOME/gems/$json_name"
ln -s "$bundle_home/specifications/$json_name.gemspec" "$GEM_HOME/specifications/$json_name.gemspec"
ln -s "$extension" "$gem_extension"
ruby -rfileutils -e '
  if spec = Gem::Specification.find_all_by_name("json").find(&:default_gem?)
    lib, arch = RbConfig::CONFIG.values_at("rubylibdir", "archdir")
    FileUtils.rm_f(spec.loaded_from)
    FileUtils.rm_rf([spec.full_gem_path, File.join(lib, "json.rb"), File.join(lib, "json"), File.join(arch, "json")])
  end
'
ruby -rjson -e 'abort "Unexpected standalone JSON version" unless "json-#{JSON::VERSION}" == ARGV.fetch(0)' "$json_name"
SH

USER 1000:1000

ENTRYPOINT ["/rails/bin/docker-entrypoint"]

EXPOSE 3000
CMD ["./bin/rails", "server"]
