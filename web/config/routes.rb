Rails.application.routes.draw do
  host_list = ->(key, fallback) do
    value = ENV[key].presence || fallback
    value.split(",").map { |host| host.strip }.reject(&:empty?)
  end

  landing_hosts = host_list.call("SILLAGE_LANDING_HOSTS", "landing.localhost,exopter.com")
  canonical_app_host = host_list.call("SILLAGE_HOSTS", "sillage.exopter.com").first
  legacy_app_hosts = host_list.call("SILLAGE_LEGACY_HOSTS", "os.exopter.com")

  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  constraints ->(request) { legacy_app_hosts.include?(request.host) } do
    match "(*path)", to: redirect(status: 301) { |_params, request|
      "https://#{canonical_app_host}#{request.fullpath}"
    }, via: :all
  end

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  constraints ->(request) { landing_hosts.include?(request.host) } do
    root "landing#show", as: :landing_root
  end
  get "landing" => "landing#show", as: :landing

  resource :session, only: %i[new create destroy]
  delete "logout" => "sessions#destroy", as: :logout
  resources :passwords, param: :token, only: %i[new create edit update]
  resources :invitations, param: :token, only: %i[edit update]

  namespace :two_factor do
    resource :setup, only: %i[new create]
    resource :challenge, only: %i[new create]
  end

  root "dashboard#index"
  get "atlas" => "dashboard#atlas", as: :atlas
  get "hangar" => "hangar/parts#index", as: :hangar
  get "signal" => "dashboard#signal", as: :signal
  get "forge" => "forge/builds#index", as: :forge
  get "core" => "core/users#index", as: :core

  scope module: :hangar, path: "hangar", as: "hangar" do
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
  end

  scope module: :forge, path: "forge", as: "forge" do
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
    resources :functions
  end

  namespace :api do
    namespace :v1 do
      namespace :bench do
        resources :test_runs, only: :create, param: :uuid, path: "test-runs"
      end
    end
  end
  get "flight/hud" => "dashboard#hud", as: :flight_hud

  get "devreference/design-system" => "devreference/design_system#show", as: :devreference_design_system

  resources :flight_imports, only: [ :new, :create, :show ]
  resources :jumps, only: [ :index, :show, :update, :destroy ]
end
