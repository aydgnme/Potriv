targetScope = 'resourceGroup'

@description('Resource prefix used by the staging foundation.')
param namePrefix string = 'potriv-stg'

param location string = resourceGroup().location
param managedEnvironmentName string
param registryName string
param runtimeIdentityName string
param containerAppsSubnetCidr string
param backendImage string

@minLength(1)
@maxLength(10)
param revisionSuffix string

@secure()
@description('Neon JDBC URL. Use the direct endpoint because Flyway runs at application startup.')
param databaseUrl string

@secure()
param databaseUsername string

@secure()
param databasePassword string

@secure()
param jwtSecret string

@secure()
param rateLimitHmacSecret string

param smtpHost string
param smtpPort int = 587
param smtpUsername string

@secure()
param smtpPassword string

param mailFrom string
param systemAdminEmail string

@secure()
param systemAdminPassword string

@description('Exact Vercel production origin, for example https://potriv.vercel.app. No wildcard.')
@minLength(8)
param frontendOrigin string

param tags object = {
  application: 'potriv'
  environment: 'staging'
  managedBy: 'bicep'
}

var backendAppName = '${namePrefix}-backend'

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: managedEnvironmentName
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource runtimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: runtimeIdentityName
}

var defaultDomain = managedEnvironment.properties.defaultDomain
var backendBaseUrl = 'https://${backendAppName}.${defaultDomain}/api'
var registryConfiguration = [
  {
    identity: runtimeIdentity.id
    server: containerRegistry.properties.loginServer
  }
]

resource backend 'Microsoft.App/containerApps@2024-03-01' = {
  name: backendAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${runtimeIdentity.id}': {}
    }
  }
  properties: {
    environmentId: managedEnvironment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 8080
        transport: 'auto'
      }
      registries: registryConfiguration
      secrets: [
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          name: 'database-username'
          value: databaseUsername
        }
        {
          name: 'database-password'
          value: databasePassword
        }
        {
          name: 'jwt-secret'
          value: jwtSecret
        }
        {
          name: 'rate-limit-hmac-secret'
          value: rateLimitHmacSecret
        }
        {
          name: 'smtp-password'
          value: smtpPassword
        }
        {
          name: 'system-admin-password'
          value: systemAdminPassword
        }
      ]
    }
    template: {
      revisionSuffix: revisionSuffix
      containers: [
        {
          name: 'backend'
          image: backendImage
          env: [
            { name: 'SPRING_PROFILES_ACTIVE', value: 'prod' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'DATABASE_USERNAME', secretRef: 'database-username' }
            { name: 'DATABASE_PASSWORD', secretRef: 'database-password' }
            { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
            { name: 'JWT_ISSUER', value: backendBaseUrl }
            { name: 'ACCESS_TOKEN_TTL_MINUTES', value: '15' }
            { name: 'REFRESH_TOKEN_TTL_DAYS', value: '7' }
            { name: 'RATE_LIMIT_ENABLED', value: 'true' }
            { name: 'RATE_LIMIT_HMAC_SECRET', secretRef: 'rate-limit-hmac-secret' }
            { name: 'RATE_LIMIT_TRUSTED_PROXIES', value: containerAppsSubnetCidr }
            { name: 'RATE_LIMIT_NO_REVERSE_PROXY', value: 'false' }
            { name: 'CORS_ALLOWED_ORIGINS', value: frontendOrigin }
            { name: 'FRONTEND_URL', value: frontendOrigin }
            { name: 'APP_BASE_URL', value: backendBaseUrl }
            { name: 'SMTP_HOST', value: smtpHost }
            { name: 'SMTP_PORT', value: string(smtpPort) }
            { name: 'SMTP_USERNAME', value: smtpUsername }
            { name: 'SMTP_PASSWORD', secretRef: 'smtp-password' }
            { name: 'MAIL_FROM', value: mailFrom }
            { name: 'MAIL_CONNECTION_TIMEOUT_MS', value: '5000' }
            { name: 'MAIL_READ_TIMEOUT_MS', value: '5000' }
            { name: 'MAIL_WRITE_TIMEOUT_MS', value: '5000' }
            { name: 'SWAGGER_ENABLED', value: 'false' }
            { name: 'BACKEND_CONSOLE_ENABLED', value: 'false' }
            { name: 'SYSTEM_ADMIN_EMAIL', value: systemAdminEmail }
            { name: 'SYSTEM_ADMIN_PASSWORD', secretRef: 'system-admin-password' }
            { name: 'JAVA_OPTS', value: '-XX:MaxRAMPercentage=75' }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/actuator/health/readiness'
                port: 8080
                scheme: 'HTTP'
              }
              initialDelaySeconds: 30
              periodSeconds: 15
              timeoutSeconds: 5
              failureThreshold: 5
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/actuator/health/readiness'
                port: 8080
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 6
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        // HTTP ingress wakes the app when traffic arrives. Zero is the cost
        // decision: staging accepts a cold start instead of paying for idle.
        minReplicas: 0
        maxReplicas: 2
        rules: [
          {
            name: 'http-requests'
            http: {
              metadata: {
                concurrentRequests: '25'
              }
            }
          }
        ]
      }
    }
  }
}

output backendFqdn string = backend.properties.configuration.ingress.fqdn
output backendUrl string = 'https://${backend.properties.configuration.ingress.fqdn}'
output backendExternal bool = backend.properties.configuration.ingress.external
output minimumReplicas int = backend.properties.template.scale.minReplicas
