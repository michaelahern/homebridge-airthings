# Requirements Document

## Introduction

This document specifies the requirements for refactoring the Homebridge Airthings plugin from an Accessory-style plugin to a Platform-style plugin. The Platform architecture enables support for multiple Airthings devices under a single configuration, automatic device discovery, and better accessory lifecycle management through Homebridge's caching mechanism.

## Glossary

- **Platform**: A Homebridge plugin type that manages multiple accessories and supports dynamic discovery
- **Accessory**: A single HomeKit device exposed by a plugin
- **PlatformAccessory**: A Homebridge-managed accessory that persists across restarts
- **DynamicPlatformPlugin**: The Homebridge interface for platforms that can add/remove accessories at runtime
- **Airthings_API**: The Airthings Consumer API used to fetch sensor data
- **Device_Config**: Per-device configuration settings (serial number, thresholds, disabled sensors)
- **Platform_Config**: Top-level configuration containing API credentials and array of device configurations

## Requirements

### Requirement 1: Platform Registration

**User Story:** As a Homebridge user, I want the plugin to register as a Platform instead of an Accessory, so that I can configure multiple Airthings devices in a single configuration block.

#### Acceptance Criteria

1. WHEN Homebridge loads the plugin, THE Platform SHALL register using `api.registerPlatform()` instead of `api.registerAccessory()`
2. THE Platform SHALL implement the `DynamicPlatformPlugin` interface
3. THE Platform SHALL implement the `configureAccessory()` method to restore cached accessories on startup

### Requirement 2: Multi-Device Configuration

**User Story:** As a user with multiple Airthings devices, I want to configure all my devices in a single platform configuration, so that I don't need separate accessory entries for each device.

#### Acceptance Criteria

1. THE Platform_Config SHALL accept a `devices` array containing multiple Device_Config objects
2. WHEN the `devices` array is empty or missing, THE Platform SHALL create accessories for each device returned by the Airthings Consumer API with default settings
3. FOR EACH Device_Config in the `devices` array, THE Platform SHALL create a corresponding PlatformAccessory
4. THE Platform_Config SHALL contain shared API credentials (`clientId`, `clientSecret`) at the platform level
5. EACH Device_Config SHALL contain optional device-specific settings (serialNumber, name, sensor thresholds, disabled flags)

### Requirement 3: Accessory Lifecycle Management

**User Story:** As a Homebridge user, I want the plugin to properly manage accessory caching, so that my devices persist across Homebridge restarts without duplicates.

#### Acceptance Criteria

1. WHEN Homebridge starts, THE Platform SHALL restore cached accessories via `configureAccessory()`
2. WHEN a configured device matches a cached accessory (by UUID), THE Platform SHALL reuse the cached accessory
3. WHEN a configured device has no cached accessory, THE Platform SHALL create and register a new PlatformAccessory using `api.registerPlatformAccessories()`
4. WHEN a cached accessory has no matching device configuration and is no longer returned from the Airthings Consumer API, THE Platform SHALL unregister it using `api.unregisterPlatformAccessories()`
5. THE Platform SHALL generate consistent UUIDs from device serial numbers using `api.hap.uuid.generate()`

### Requirement 4: Accessory Handler Separation

**User Story:** As a developer, I want the accessory logic separated from the platform logic, so that the codebase is maintainable and follows Homebridge best practices.

#### Acceptance Criteria

1. THE Platform SHALL delegate accessory-specific logic to a separate Accessory Handler class
2. THE Accessory_Handler SHALL receive the platform instance, PlatformAccessory, and Device_Config
3. THE Accessory_Handler SHALL configure all HomeKit services (Air Quality, Temperature, Humidity, CO2, etc.)
4. THE Accessory_Handler SHALL handle sensor data refresh and characteristic updates
5. WHEN the Accessory_Handler updates characteristics, THE Platform SHALL NOT be directly involved

### Requirement 5: Shared API Client

**User Story:** As a user, I want the plugin to efficiently use the Airthings API, so that I don't exceed rate limits when using multiple devices.

#### Acceptance Criteria

1. THE Platform SHALL create a single shared Airthings_API client instance
2. WHEN refreshing sensor data, THE Platform SHALL fetch data for all configured serial numbers in a single API call
3. THE Platform SHALL distribute fetched sensor results to the appropriate Accessory_Handler instances

### Requirement 6: Service Configuration Preservation

**User Story:** As an existing user, I want all current sensor services to work the same way after the refactor, so that my HomeKit automations continue to function.

#### Acceptance Criteria

1. THE Accessory_Handler SHALL expose the same HomeKit services as the current Accessory plugin:
   - Air Quality Sensor with CO2, Humidity, PM2.5, Radon, and VOC characteristics
   - Temperature Sensor
   - Humidity Sensor
   - Carbon Dioxide Sensor
   - Air Pressure Sensor (Eve-compatible)
   - Battery Service
   - Radon Leak Sensor (optional)
2. THE Accessory_Handler SHALL apply the same air quality calculation logic based on sensor thresholds
3. THE Accessory_Handler SHALL support the same per-device configuration options (disabled sensors, thresholds)
4. THE Accessory_Handler SHALL use the same custom characteristic UUIDs for Radon and VOC

### Requirement 7: Configuration Schema Update

**User Story:** As a Homebridge UI user, I want the configuration form to support the new platform structure, so that I can easily configure multiple devices.

#### Acceptance Criteria

1. THE config.schema.json SHALL change `pluginType` from "accessory" to "platform"
2. THE config.schema.json SHALL move `clientId` and `clientSecret` to the platform level
3. THE config.schema.json SHALL define a `devices` array with per-device configuration
4. THE config.schema.json SHALL support adding/removing devices in the Homebridge UI
5. WHEN displaying the configuration form, THE Homebridge_UI SHALL show a repeatable device section

### Requirement 8: Error Handling

**User Story:** As a user, I want clear error messages when configuration is invalid, so that I can fix issues quickly.

#### Acceptance Criteria

1. IF `clientId` is missing, THEN THE Platform SHALL log an error and skip device initialization
2. IF `clientSecret` is missing, THEN THE Platform SHALL log an error and skip device initialization
3. IF a Device_Config has no `serialNumber`, THEN THE Platform SHALL log a warning and skip that device
4. IF the Airthings_API returns an error, THEN THE Platform SHALL log the error and set accessories to inactive status
5. WHEN an API rate limit is encountered, THE Platform SHALL log a warning with guidance on adjusting refresh interval

### Requirement 9: Graceful Shutdown

**User Story:** As a Homebridge user, I want the plugin to clean up properly on shutdown, so that resources are released correctly.

#### Acceptance Criteria

1. WHEN Homebridge emits the "shutdown" event, THE Platform SHALL stop all refresh timers
2. WHEN Homebridge shuts down, THE Platform SHALL NOT attempt further API calls
