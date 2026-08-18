Rails.application.routes.draw do
  host_list = ->(key, fallback) do
    value = ENV[key].presence || fallback
    value.split(",").map { |host| host.strip }.reject(&:empty?)
  end

  landing_hosts = host_list.call("SILLAGE_LANDING_HOSTS", "landing.localhost,exopter.com")

  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check
  get "ready" => "readiness#show", as: :readiness if ActiveModel::Type::Boolean.new.cast(ENV.fetch("MONITORING_ENABLED", "false"))

  constraints ->(request) { landing_hosts.include?(request.host) } do
    root "landing#show", as: :landing_root
  end

  resource :session, only: %i[new create destroy]
  delete "logout" => "sessions#destroy", as: :logout
  resources :passwords, param: :token, only: %i[new create edit update]
  resources :invitations, param: :token, only: %i[edit update]

  namespace :two_factor do
    resource :setup, only: %i[new create]
    resource :challenge, only: %i[new create]
  end

  root "flights#index"
  get "hangar" => "hangar/aircraft#index", as: :hangar
  get "signal" => "signal#index", as: :signal
  get "forge" => "forge/fdrs#index", as: :forge
  get "core" => "core/users#index", as: :core

  scope module: :hangar, path: "hangar", as: "hangar" do
    resources :aircraft do
      resources :installations, only: :create
    end
    resources :installations, only: :destroy
    resources :parts
    resources :assemblies do
      member do
        post :install_part
        delete "parts/:part_id", action: :remove_part, as: :remove_part
        patch "parts/:part_id/replace", action: :replace_part, as: :replace_part
        post :attach_assembly
        delete "assemblies/:child_id", action: :detach_assembly, as: :detach_assembly
      end
    end
    resources :functions
  end

  resources :signal_sessions, only: :create

  scope module: :forge, path: "forge", as: "forge" do
    resources :fdrs, only: %i[index show update] do
      member do
        get :connectivity
        get :activity
      end
      resources :fdr_wifi_profiles, only: %i[create update destroy], path: "wifi-profiles" do
        member { patch :move }
      end
    end
    resources :wifi_credentials, only: :update, path: "wifi-credentials"
    resources :builds do
      member do
        post :clone
        patch :refresh_snapshot
      end
    end
    resources :test_runs, only: %i[index show] do
      member { patch :validate }
    end
    resource :bench_token, only: %i[create destroy]
  end

  namespace :core do
    resources :users, only: %i[index create edit update] do
      member do
        post :resend_invitation
        patch :disable
        patch :enable
        patch :reset_two_factor
      end
    end
  end

  namespace :api do
    namespace :v1 do
      resource :fdr_registration, only: %i[show create], path: "fdr-registration"
      resource :fdr_sillage_heartbeat, only: :create, path: "fdr-sillage-heartbeat"
      resources :fdr_sillage_heartbeats, only: :index, path: "fdr-sillage-heartbeats"
      resources :fdr_wifi_uploads, only: :create, param: :token, path: "fdr-wifi-uploads" do
        member do
          patch :chunk
          post :complete
        end
      end
      resource :fdr_authentication, only: :create, path: "fdr-authentication"
      resources :fdrs, only: [] do
        resource :initialization, controller: "fdr_initializations", only: %i[create update]
        resource :wifi_provisioning, controller: "fdr_wifi_provisionings", only: %i[create update], path: "wifi-provisioning"
      end
      resources :fdr_syncs, only: :create, path: "fdr-syncs"
      resources :signal_sessions, only: :create, param: :uuid do
        member do
          post :batches
          post :events
          patch :complete
        end
      end
      namespace :bench do
        resources :test_runs, only: :create, param: :uuid, path: "test-runs"
      end
    end
  end
  get "flight/hud" => "dashboard#hud", as: :flight_hud

  resources :flight_imports, only: [ :new, :create, :show ]
  resources :flights
end
