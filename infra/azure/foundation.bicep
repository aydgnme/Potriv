targetScope = 'resourceGroup'

@description('Short environment prefix used for every Azure resource name.')
@minLength(3)
@maxLength(20)
param namePrefix string = 'potriv-stg'

@description('Azure region for the staging environment.')
param location string = resourceGroup().location

@description('Resource tags applied to every supported resource.')
param tags object = {
  application: 'potriv'
  environment: 'staging'
  managedBy: 'bicep'
}

var uniqueSuffix = take(uniqueString(subscription().subscriptionId, resourceGroup().id), 8)
var compactPrefix = toLower(replace(namePrefix, '-', ''))
var virtualNetworkName = '${namePrefix}-vnet'
var containerAppsSubnetName = 'snet-container-apps'
var containerAppsSubnetCidr = '10.20.0.0/27'
var registryName = take('${compactPrefix}${uniqueSuffix}', 50)
var workspaceName = '${namePrefix}-logs-${uniqueSuffix}'
var environmentName = '${namePrefix}-aca-${uniqueSuffix}'
var identityName = '${namePrefix}-runtime-${uniqueSuffix}'

// The VNet has no gateway, NAT gateway, or private endpoint charge. Its narrow
// purpose is to give the Container Apps ingress proxy a known address range so
// the backend can trust forwarded client addresses without trusting the world.
resource virtualNetwork 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: virtualNetworkName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.20.0.0/16'
      ]
    }
  }
}

resource containerAppsSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' = {
  parent: virtualNetwork
  name: containerAppsSubnetName
  properties: {
    addressPrefix: containerAppsSubnetCidr
    delegations: [
      {
        name: 'container-apps-environment'
        properties: {
          serviceName: 'Microsoft.App/environments'
        }
      }
    ]
    privateEndpointNetworkPolicies: 'Disabled'
  }
}

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsWorkspace.properties.customerId
        sharedKey: logAnalyticsWorkspace.listKeys().primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: containerAppsSubnet.id
      internal: false
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    zoneRedundant: false
  }
}

// Basic ACR is the only intentional fixed-cost application resource. It avoids
// a long-lived third-party registry password: the runtime pulls through the
// user-assigned identity below and ACR admin credentials stay disabled.
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    dataEndpointEnabled: false
    networkRuleBypassOptions: 'AzureServices'
    publicNetworkAccess: 'Enabled'
  }
}

resource runtimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: tags
}

resource acrPullRoleDefinition 'Microsoft.Authorization/roleDefinitions@2022-04-01' existing = {
  scope: subscription()
  name: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
}

resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: containerRegistry
  name: guid(containerRegistry.id, runtimeIdentity.id, acrPullRoleDefinition.id)
  properties: {
    principalId: runtimeIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleDefinition.id
  }
}

output registryName string = containerRegistry.name
output registryLoginServer string = containerRegistry.properties.loginServer
output managedEnvironmentName string = managedEnvironment.name
output runtimeIdentityName string = runtimeIdentity.name
output containerAppsSubnetCidr string = containerAppsSubnetCidr
