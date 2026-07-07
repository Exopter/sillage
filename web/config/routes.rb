Rails.application.routes.draw do
  host_list = ->(key, fallback) do
    value = ENV[key].presence || fallback
    value.split(",").map { |host| host.strip }.reject(&:empty?)
  end

  landing_hosts = host_list.call("EXOPTER_OS_LANDING_HOSTS", "landing.localhost,exopter.com")

  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

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
  get "hangar" => "dashboard#hangar", as: :hangar
  get "signal" => "dashboard#signal", as: :signal
  get "forge" => "dashboard#forge", as: :forge
  get "core" => "core/users#index", as: :core
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
  get "flight/hud" => "dashboard#hud", as: :flight_hud

  get "devreference/design-system" => "devreference/design_system#show", as: :devreference_design_system

  resources :flight_imports, only: [ :new, :create, :show ]
  resources :jumps, only: [ :index, :show, :update, :destroy ]
end
