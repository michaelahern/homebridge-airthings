import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';

import { AirthingsConfig } from './config.js';
import { AirthingsPlatformAccessory } from './platformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

type AirthingsHomebridgePlatformConfig = PlatformConfig & AirthingsConfig;

export class AirthingsPlatform implements DynamicPlatformPlugin {
    public readonly accessories: PlatformAccessory[] = [];
    public readonly config: AirthingsHomebridgePlatformConfig;

    constructor(
        public readonly log: Logger,
        public readonly platformConfig: PlatformConfig,
        public readonly api: API
    ) {
        this.config = this.platformConfig as AirthingsHomebridgePlatformConfig;

        if (!this.config.refreshInterval) {
            this.config.refreshInterval = 150;
        }

        if (!Number.isSafeInteger(this.config.refreshInterval)) {
            this.log.warn('Invalid config value: refreshInterval (not a valid integer)');
            this.config.refreshInterval = 150;
        }

        if (this.config.refreshInterval < 60) {
            this.log.warn('Invalid config value: refreshInterval (<60s may cause rate limiting)');
            this.config.refreshInterval = 60;
        }

        if (!this.config.debug) {
            this.config.debug = false;
        }

        this.log.info('Platform Settings:');
        this.log.info(` * Debug Logging: ${this.config.debug}`);
        this.log.info(` * Refresh Interval: ${this.config.refreshInterval}s`);

        this.api.on('didFinishLaunching', async () => {
            await this.discoverDevices();
        });
    }

    public configureAccessory(accessory: PlatformAccessory) {
        this.log.info(`[${accessory.displayName}] Loading accessory from cache...`);
        this.accessories.push(accessory);
    }

    private async discoverDevices() {
        const discoveredAccessoryUUIDs = new Set<string>();

        for (const deviceConfig of this.config.devices) {
            if (!deviceConfig.clientId) {
                this.log.error(`[${deviceConfig.name}] Missing required config value: clientId`);
                continue;
            }

            if (!deviceConfig.clientSecret) {
                this.log.error(`[${deviceConfig.name}] Missing required config value: clientSecret`);
                continue;
            }

            if (!deviceConfig.serialNumber) {
                this.log.error(`[${deviceConfig.name}] Missing required config value: serialNumber`);
                continue;
            }

            if (!deviceConfig.co2DetectedThreshold) {
                deviceConfig.co2DetectedThreshold = 1000;
            }

            if (!Number.isSafeInteger(deviceConfig.co2DetectedThreshold)) {
                this.log.warn(`[${deviceConfig.name}] Invalid config value: co2DetectedThreshold (not a valid integer)`);
                deviceConfig.co2DetectedThreshold = 1000;
            }

            if (deviceConfig.radonLeakThreshold && !Number.isSafeInteger(deviceConfig.radonLeakThreshold)) {
                this.log.warn(`[${deviceConfig.name}] Invalid config value: radonLeakThreshold (not a valid integer)`);
                deviceConfig.radonLeakThreshold = undefined;
            }

            const uuid = this.api.hap.uuid.generate(deviceConfig.serialNumber);

            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

            if (existingAccessory) {
                this.log.info(`[${deviceConfig.name}] Restoring existing accessory from cache with serial ${deviceConfig.serialNumber}`);
                existingAccessory.displayName = deviceConfig.name;

                new AirthingsPlatformAccessory(this, existingAccessory, deviceConfig);

                this.api.updatePlatformAccessories([existingAccessory]);
            }
            else {
                this.log.info(`[${deviceConfig.name}] Adding new accessory with serial ${deviceConfig.serialNumber}`);
                const accessory = new this.api.platformAccessory(deviceConfig.name, uuid);

                new AirthingsPlatformAccessory(this, accessory, deviceConfig);

                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }

            discoveredAccessoryUUIDs.add(uuid);
        }

        const orphanedAccessories = this.accessories.filter(accessory => !discoveredAccessoryUUIDs.has(accessory.UUID));
        for (const orphanedAccessory of orphanedAccessories) {
            this.log.info(`[${orphanedAccessory.displayName}] Removing orphaned accessory from cache...`);
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [orphanedAccessory]);
        }
    }
}
