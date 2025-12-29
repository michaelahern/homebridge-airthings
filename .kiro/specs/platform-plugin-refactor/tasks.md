# Implementation Plan: Platform Plugin Refactor

## Overview

This plan converts the Homebridge Airthings plugin from an Accessory-style architecture to a Platform-style architecture. Tasks are ordered to build incrementally, with each step validating core functionality before proceeding.

## Tasks

- [x] 1. Create foundational files and update module entry point
  - [x] 1.1 Create settings.ts with PLATFORM_NAME and PLUGIN_NAME constants
    - Export `PLATFORM_NAME = 'Airthings'` and `PLUGIN_NAME = 'homebridge-airthings'`
    - _Requirements: 1.1_
  - [x] 1.2 Update module.ts to use registerPlatform instead of registerAccessory
    - Import from settings.ts and platform.ts
    - Call `api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, AirthingsPlatform)`
    - _Requirements: 1.1_

- [x] 2. Implement Platform class with DynamicPlatformPlugin interface
  - [x] 2.1 Create platform.ts with AirthingsPlatform class skeleton
    - Implement `DynamicPlatformPlugin` interface
    - Define `AirthingsPlatformConfig` and `AirthingsDeviceConfig` interfaces
    - Initialize `accessories` array, `accessoryHandlers` Map, and `isShuttingDown` flag
    - Create shared `AirthingsClient` instance in constructor
    - _Requirements: 1.2, 5.1_
  - [x] 2.2 Implement configureAccessory() method
    - Store restored accessories in the `accessories` array
    - Log debug message for each restored accessory
    - _Requirements: 1.3, 3.1_
  - [ ]* 2.3 Write property test for accessory caching
    - **Property 2: Accessory Caching**
    - **Validates: Requirements 1.3, 3.1**
  - [x] 2.4 Implement didFinishLaunching event handler
    - Register listener in constructor
    - Call `discoverDevices()` when event fires
    - _Requirements: 2.2, 2.3_
  - [x] 2.5 Implement shutdown event handler
    - Set `isShuttingDown` flag to true
    - Clear `refreshTimer` if set
    - _Requirements: 9.1, 9.2_
  - [ ]* 2.6 Write property test for shutdown prevents API calls
    - **Property 16: Shutdown Prevents API Calls**
    - **Validates: Requirements 9.2**

- [x] 3. Checkpoint - Verify platform registration
  - Ensure platform registers correctly with Homebridge
  - Ensure all tests pass, ask the user if questions arise

- [x] 4. Implement device discovery and accessory lifecycle
  - [x] 4.1 Implement discoverDevices() method
    - Validate clientId and clientSecret (skip if missing)
    - Fetch devices from Airthings API
    - Merge with config.devices array (if present) or use API devices with defaults
    - _Requirements: 2.1, 2.2, 2.4, 8.1, 8.2_
  - [ ]* 4.2 Write property test for missing credentials validation
    - **Property 13: Missing Credentials Validation**
    - **Validates: Requirements 8.1, 8.2**
  - [x] 4.3 Implement UUID generation and accessory matching
    - Generate UUID from serial number using `api.hap.uuid.generate()`
    - Check if cached accessory exists with matching UUID
    - _Requirements: 3.2, 3.5_
  - [ ]* 4.4 Write property test for UUID generation consistency
    - **Property 1: UUID Generation Consistency**
    - **Validates: Requirements 3.5**
  - [x] 4.5 Implement new accessory registration
    - Create new PlatformAccessory when no cache match
    - Call `api.registerPlatformAccessories()` for new accessories
    - _Requirements: 3.3_
  - [ ]* 4.6 Write property test for new accessory registration
    - **Property 6: New Accessory Registration**
    - **Validates: Requirements 3.3**
  - [x] 4.7 Implement orphan accessory cleanup
    - Identify cached accessories not matching any device
    - Call `api.unregisterPlatformAccessories()` for orphans
    - _Requirements: 3.4_
  - [ ]* 4.8 Write property test for orphan accessory cleanup
    - **Property 7: Orphan Accessory Cleanup**
    - **Validates: Requirements 3.4**

- [x] 5. Checkpoint - Verify device discovery
  - Ensure devices are discovered and accessories created/reused correctly
  - Ensure all tests pass, ask the user if questions arise

- [x] 6. Implement Accessory Handler class
  - [x] 6.1 Create accessory.ts with AirthingsAccessory class
    - Accept platform, PlatformAccessory, and AirthingsDeviceConfig
    - Store device info from `getAirthingsDeviceInfoBySerialNumber()`
    - Define `AirthingsAccessoryContext` interface
    - _Requirements: 4.1, 4.2_
  - [x] 6.2 Implement HomeKit service configuration
    - Configure AccessoryInformation service
    - Configure Air Quality service with sensor characteristics
    - Configure Temperature, Humidity, CO2, Air Pressure services
    - Configure Battery service (if not disabled)
    - Configure Radon Leak service (if threshold set)
    - Use same custom UUIDs for Radon and VOC characteristics
    - _Requirements: 6.1, 6.4_
  - [ ]* 6.3 Write property test for service configuration by device sensors
    - **Property 8: Service Configuration by Device Sensors**
    - **Validates: Requirements 4.3**
  - [x] 6.4 Implement updateCharacteristics() method
    - Update all service characteristics from SensorResult
    - Handle missing sensor values gracefully
    - Set StatusActive based on data freshness
    - _Requirements: 4.4_
  - [ ]* 6.5 Write property test for characteristic updates
    - **Property 9: Characteristic Updates from Sensor Data**
    - **Validates: Requirements 4.4**
  - [x] 6.6 Implement getAirQuality() method
    - Apply threshold logic for CO2, humidity, PM2.5, radon, VOC
    - Respect disabled sensor flags
    - Return worst air quality level across enabled sensors
    - _Requirements: 6.2, 6.3_
  - [ ]* 6.7 Write property test for air quality calculation
    - **Property 11: Air Quality Calculation**
    - **Validates: Requirements 6.2**
  - [ ]* 6.8 Write property test for disabled sensor configuration
    - **Property 12: Disabled Sensor Configuration**
    - **Validates: Requirements 6.3**

- [x] 7. Checkpoint - Verify accessory handler
  - Ensure services are configured correctly for different device types
  - Ensure all tests pass, ask the user if questions arise

- [x] 8. Implement sensor data refresh
  - [x] 8.1 Implement refreshAllDevices() method in platform
    - Check `isShuttingDown` flag before API call
    - Fetch sensor data for all serial numbers in single API call
    - Distribute results to matching accessory handlers
    - Handle API errors by setting accessories inactive
    - _Requirements: 5.2, 5.3, 8.4, 9.2_
  - [ ]* 8.2 Write property test for sensor result distribution
    - **Property 10: Sensor Result Distribution**
    - **Validates: Requirements 5.3**
  - [ ]* 8.3 Write property test for API error handling
    - **Property 15: API Error Handling**
    - **Validates: Requirements 8.4**
  - [x] 8.4 Implement refresh timer
    - Start timer after device discovery
    - Call `refreshAllDevices()` at configured interval
    - Validate and clamp refreshInterval (min 60s, default 150s)
    - _Requirements: 5.2_

- [x] 9. Checkpoint - Verify data refresh
  - Ensure sensor data refreshes correctly for all devices
  - Ensure all tests pass, ask the user if questions arise

- [x] 10. Update configuration schema
  - [x] 10.1 Update config.schema.json for platform architecture
    - Change `pluginType` from "accessory" to "platform"
    - Move `clientId` and `clientSecret` to platform level
    - Add `devices` array with per-device configuration schema
    - Configure UI layout with expandable device sections
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [-] 11. Wire platform and accessory handler together
  - [x] 11.1 Integrate AirthingsAccessory creation in discoverDevices()
    - Create handler for each device (cached or new)
    - Store handlers in `accessoryHandlers` Map
    - Skip devices with missing serialNumber
    - _Requirements: 4.1, 8.3_
  - [ ]* 11.2 Write property test for missing serial number validation
    - **Property 14: Missing Serial Number Validation**
    - **Validates: Requirements 8.3**
  - [ ]* 11.3 Write property test for device-to-accessory mapping
    - **Property 3: Device-to-Accessory Mapping**
    - **Validates: Requirements 2.3**
  - [ ]* 11.4 Write property test for auto-discovery
    - **Property 4: Auto-Discovery**
    - **Validates: Requirements 2.2**
  - [ ]* 11.5 Write property test for cached accessory reuse
    - **Property 5: Cached Accessory Reuse**
    - **Validates: Requirements 3.2**

- [x] 12. Clean up old accessory plugin
  - [x] 12.1 Remove or archive old plugin.ts
    - The old `AirthingsPlugin` class is no longer needed
    - Keep device.ts as it's reused by the new architecture

- [x] 13. Final checkpoint - Full integration test
  - Ensure all tests pass
  - Verify plugin loads correctly in Homebridge
  - Verify multi-device configuration works
  - Ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The existing `device.ts` is preserved and reused
- fast-check library should be used for property-based testing
  