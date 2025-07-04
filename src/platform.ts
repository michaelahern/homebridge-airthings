import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';

import { AirthingsPlatformConfig } from './config.js';
import { AirthingsPlatformAccessory } from './platformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

export class AirthingsPlatform implements DynamicPlatformPlugin {
    public readonly accessories: PlatformAccessory[] = [];
    public readonly config: AirthingsPlatformConfig;

    constructor(readonly log: Logger, platformConfig: PlatformConfig, readonly api: API) {
        this.config = platformConfig as AirthingsPlatformConfig;

        this.log.debug('Finished initializing platform:', this.config.name);

        // When this event is fired it means Homebridge has restored all cached accessories from disk.
        // Dynamic Platform plugins should only register new accessories after this event was fired,
        // in order to ensure they weren't added to homebridge already. This event can also be used
        // to start discovery of new accessories.
        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            // Run the method to discover / register your accessories as necessary
            this.discoverDevices();
        });
    }

    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);

        // Add the restored accessory to the accessories cache so we can track if it has already been registered or not.
        // The array is used to track which accessories have been registered already.
        this.accessories.push(accessory);
    }

    /**
     * This is an example method showing how to register discovered accessories.
     * Accessories must only be registered once, previously created accessories
     * must not be registered again to prevent "duplicate UUID" errors.
     */
    discoverDevices() {
        // Validate config
        if (!this.config.clientId) {
            this.log.error('Missing required config value: clientId');
            return;
        }

        if (!this.config.clientSecret) {
            this.log.error('Missing required config value: clientSecret');
            return;
        }

        if (!this.config.devices || this.config.devices.length === 0) {
            this.log.error('No devices configured');
            return;
        }

        // Loop over the discovered devices and register each one if it has not already been registered
        for (const device of this.config.devices) {
            // Generate a unique id for the accessory based on the serial number
            const uuid = this.api.hap.uuid.generate(device.serialNumber);

            // See if an accessory with the same uuid has already been registered and restored from
            // the cached devices we stored in the `configureAccessory` method above
            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

            if (existingAccessory) {
                // The accessory already exists
                this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                // If you need to update the accessory.context then you should run `api.updatePlatformAccessories`. e.g.:
                existingAccessory.context.device = device;
                this.api.updatePlatformAccessories([existingAccessory]);

                // Create the accessory handler for the restored accessory
                // this is imported from `platformAccessory.ts`
                new AirthingsPlatformAccessory(this, existingAccessory);

                // It is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])`
                // Example: this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
            }
            else {
                // The accessory does not yet exist, so we need to create it
                this.log.info('Adding new accessory:', device.name);

                // Create a new accessory
                const accessory = new this.api.platformAccessory(device.name, uuid);

                // Store a copy of the device object in the `accessory.context`
                // The `context` property can be used to store any data about the accessory you may need
                accessory.context.device = device;

                // Create the accessory handler for the newly created accessory
                // this is imported from `platformAccessory.ts`
                new AirthingsPlatformAccessory(this, accessory);

                // Link the accessory to your platform
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
        }
    }
}
