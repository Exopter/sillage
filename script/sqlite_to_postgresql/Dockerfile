FROM ruby:4.0.3-slim

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential libpq-dev libsqlite3-dev && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

WORKDIR /migration

COPY script/sqlite_to_postgresql/Gemfile script/sqlite_to_postgresql/Gemfile.lock ./
RUN bundle install

COPY script/remove_sqlite_after_postgresql_restore /remove_sqlite_after_postgresql_restore
COPY script/sqlite_to_postgresql/ ./

ENTRYPOINT ["bundle", "exec", "ruby", "migrate.rb"]
