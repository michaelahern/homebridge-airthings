import { AirthingsClient, Device, SensorUnits } from 'airthings-consumer-api';
import {
    API,
    Characteristic,
    DynamicPlatformPlugin,
    Logging,
    PlatformAccessory,
    Service
} from 'homebridge';

import { AirthingsAccessory } from './accessory.js';
import { AirthingsDeviceConfig, AirthingsPlatformConfig } from './config.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

/**
 * Accessory context stored with each PlatformAccessory
 */
export interface AirthingsAccessoryContext {
    serialNumber: string;
    deviceConfig: AirthingsDeviceConfig;
}

/**
 * AirthingsPlatform
 * Platform plugin for managing multiple Airthings devices
 */
export class AirthingsPlatform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service;
    public readonly Characteristic: typeof Characteristic;

    // Cached accessories restored from disk
    public readonly accessories: PlatformAccessory[] = [];

    // Active accessory handlers mapped by serial number
    public readonly accessoryHandlers = new Map<string, AirthingsAccessory>();

    // Shared API client (created lazily after credential validation)
    public airthingsClient?: AirthingsClient;

    // Refresh timer reference
    public refreshTimer: NodeJS.Timeout | undefined;

    // Flag to prevent API calls after shutdown
    public isShuttingDown = false;

    constructor(
        public readonly log: Logging,
        public readonly config: AirthingsPlatformConfig,
        public readonly api: API
    ) {
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;

        this.log.debug('Finished initializing platform:', PLATFORM_NAME);

        // Register didFinishLaunching event handler
        this.api.on('didFinishLaunching', () => {
            this.log.debug('Executed didFinishLaunching callback');
            this.discoverDevices();
        });

        // Register shutdown event handler
        this.api.on('shutdown', () => {
            this.log.debug('Shutdown event received');
            this.isShuttingDown = true;
            if (this.refreshTimer) {
                clearInterval(this.refreshTimer);
                this.refreshTimer = undefined;
            }
        });
    }

    /**
     * Called by Homebridge to restore cached accessories
     */
    configureAccessory(accessory: PlatformAccessory): void {
        this.log.debug('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }

    /**
     * Discover devices from Airthings API and create/restore accessories
     */
    async discoverDevices(): Promise<void> {
        this.log.debug('Discovering devices...');

        // Validate clientId and clientSecret (Requirements 8.1, 8.2)
        if (!this.config.clientId || !this.config.clientSecret) {
            this.log.error('Missing clientId or clientSecret in configuration. Skipping device initialization.');
            return;
        }

        // Create shared Airthings API client (lazily, after credential validation)
        if (!this.airthingsClient) {
            this.airthingsClient = new AirthingsClient({
                clientId: this.config.clientId,
                clientSecret: this.config.clientSecret
            });
        }

        let apiDevices: Device[] = [];
        try {
            // Fetch devices from Airthings API
            const devicesResponse = await this.airthingsClient.getDevices();
            apiDevices = devicesResponse.devices;
            this.log.debug(`Fetched ${apiDevices.length} devices from Airthings API`);
        }
        catch (error) {
            this.log.error('Failed to fetch devices from Airthings API:', error instanceof Error ? error.message : String(error));
            return;
        }

        // Merge with config.devices array or use API devices with defaults (Requirements 2.1, 2.2, 2.4)
        const deviceConfigs = this.mergeDeviceConfigs(apiDevices);

        // Track which cached accessories are still valid
        const validAccessoryUUIDs = new Set<string>();

        // Process each device
        for (const deviceConfig of deviceConfigs) {
            // Skip devices with missing serialNumber (Requirement 8.3)
            if (!deviceConfig.serialNumber) {
                this.log.warn('Device configuration missing serialNumber, skipping device');
                continue;
            }

            // Generate UUID from serial number (Requirement 3.5)
            const uuid = this.api.hap.uuid.generate(deviceConfig.serialNumber);
            validAccessoryUUIDs.add(uuid);

            // Check if cached accessory exists with matching UUID (Requirement 3.2)
            const existingAccessory = this.accessories.find(acc => acc.UUID === uuid);

            if (existingAccessory) {
                // Reuse cached accessory (Requirement 3.2)
                this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                // Update context with latest config
                existingAccessory.context = {
                    serialNumber: deviceConfig.serialNumber,
                    deviceConfig: deviceConfig
                } as AirthingsAccessoryContext;

                // Create accessory handler and store in map (Requirement 4.1)
                const handler = new AirthingsAccessory(this, existingAccessory, deviceConfig);
                this.accessoryHandlers.set(deviceConfig.serialNumber, handler);
            }
            else {
                // Create new PlatformAccessory (Requirement 3.3)
                const displayName = deviceConfig.name || `Airthings ${deviceConfig.serialNumber}`;
                this.log.info('Adding new accessory:', displayName);

                const accessory = new this.api.platformAccessory(displayName, uuid);
                accessory.context = {
                    serialNumber: deviceConfig.serialNumber,
                    deviceConfig: deviceConfig
                } as AirthingsAccessoryContext;

                // Register new accessory with Homebridge (Requirement 3.3)
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

                // Create accessory handler and store in map (Requirement 4.1)
                const handler = new AirthingsAccessory(this, accessory, deviceConfig);
                this.accessoryHandlers.set(deviceConfig.serialNumber, handler);
            }
        }

        // Identify and remove orphan accessories (Requirement 3.4)
        const orphanAccessories = this.accessories.filter(acc => !validAccessoryUUIDs.has(acc.UUID));
        if (orphanAccessories.length > 0) {
            this.log.info(`Removing ${orphanAccessories.length} orphaned accessories`);
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, orphanAccessories);
        }

        // Start refresh timer after device discovery (Requirement 5.2)
        this.startRefreshTimer();
    }

    /**
     * Start the refresh timer to periodically fetch sensor data
     * Validates and clamps refreshInterval (min 60s, default 150s)
     * Requirement: 5.2
     */
    private startRefreshTimer(): void {
        // Clear any existing timer
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
        }

        // Validate and clamp refreshInterval
        let refreshInterval = this.config.refreshInterval ?? 150;

        if (!Number.isSafeInteger(refreshInterval)) {
            this.log.warn('Invalid config value: refreshInterval (not a valid integer), using default 150s');
            refreshInterval = 150;
        }

        if (refreshInterval < 60) {
            this.log.warn('Invalid config value: refreshInterval (<60s may cause rate limiting), using minimum 60s');
            refreshInterval = 60;
        }

        this.log.info(`Starting sensor refresh timer with interval: ${refreshInterval}s`);

        // Perform initial refresh
        this.refreshAllDevices();

        // Start periodic refresh timer
        this.refreshTimer = setInterval(() => {
            this.refreshAllDevices();
        }, refreshInterval * 1000);
    }

    /**
     * Merge API devices with config.devices array
     * If config.devices is empty/missing, use all API devices with defaults
     */
    private mergeDeviceConfigs(apiDevices: Device[]): AirthingsDeviceConfig[] {
        const configDevices = this.config.devices ?? [];

        // If no devices configured, use all API devices with defaults (Requirement 2.2)
        if (configDevices.length === 0) {
            this.log.debug('No devices configured, using all API devices with defaults');
            return apiDevices.map(device => ({
                serialNumber: device.serialNumber,
                name: device.name
            }));
        }

        // Merge config devices with API device info
        const mergedConfigs: AirthingsDeviceConfig[] = [];

        for (const configDevice of configDevices) {
            if (!configDevice.serialNumber) {
                // Skip config entries without serial number
                continue;
            }

            // Find matching API device for name fallback
            const apiDevice = apiDevices.find(d => d.serialNumber === configDevice.serialNumber);

            mergedConfigs.push({
                ...configDevice,
                name: configDevice.name || apiDevice?.name || `Airthings ${configDevice.serialNumber}`
            });
        }

        return mergedConfigs;
    }

    /**
     * Refresh sensor data for all devices
     * Fetches data for all serial numbers in a single API call and distributes to handlers
     * Requirements: 5.2, 5.3, 8.4, 9.2
     */
    async refreshAllDevices(): Promise<void> {
        // Check isShuttingDown flag before API call (Requirement 9.2)
        if (this.isShuttingDown) {
            this.log.debug('Shutdown in progress, skipping sensor refresh');
            return;
        }

        // Skip if no API client (credentials were missing)
        if (!this.airthingsClient) {
            this.log.debug('No API client available, skipping sensor refresh');
            return;
        }

        // Get all serial numbers from accessory handlers
        const serialNumbers = Array.from(this.accessoryHandlers.keys());
        if (serialNumbers.length === 0) {
            this.log.debug('No devices to refresh');
            return;
        }

        this.log.debug(`Refreshing sensor data for ${serialNumbers.length} device(s)`);

        try {
            // Fetch sensor data for all serial numbers in single API call (Requirement 5.2)
            const sensorResults = await this.airthingsClient.getSensors(SensorUnits.Metric);

            if (sensorResults.results.length === 0) {
                this.log.warn('No sensor results returned from API');
                this.setAllAccessoriesInactive();
                return;
            }

            // Distribute results to matching accessory handlers (Requirement 5.3)
            for (const result of sensorResults.results) {
                const handler = this.accessoryHandlers.get(result.serialNumber);
                if (handler) {
                    try {
                        handler.updateCharacteristics(result);
                    }
                    catch (error) {
                        this.log.error(`Error updating characteristics for ${result.serialNumber}:`, error instanceof Error ? error.message : String(error));
                    }
                }
                else {
                    this.log.debug(`No handler found for serial number: ${result.serialNumber}`);
                }
            }

            // Log warning for devices that didn't receive results
            const receivedSerials = new Set(sensorResults.results.map(r => r.serialNumber));
            for (const serial of serialNumbers) {
                if (!receivedSerials.has(serial)) {
                    this.log.warn(`No sensor data received for device: ${serial}`);
                }
            }

            if (this.config.debug) {
                this.log.debug(`Sensor refresh complete: ${sensorResults.results.length} results received`);
            }
        }
        catch (error) {
            // Handle API errors by setting accessories inactive (Requirement 8.4)
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log.error('Failed to fetch sensor data from Airthings API:', error);

            // Check for rate limit error (429)
            if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit')) {
                this.log.warn('Rate limit exceeded. Consider increasing refreshInterval in configuration (minimum 60s recommended).');
            }

            this.setAllAccessoriesInactive();
        }
    }

    /**
     * Set all accessory handlers to inactive status
     * Used when API errors occur (Requirement 8.4)
     */
    private setAllAccessoriesInactive(): void {
        for (const handler of this.accessoryHandlers.values()) {
            try {
                handler.setInactive();
            }
            catch (error) {
                this.log.error('Error setting accessory inactive:', error instanceof Error ? error.message : String(error));
            }
        }
    }
}
