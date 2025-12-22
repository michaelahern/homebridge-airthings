import { AirthingsClient, SensorResult, SensorUnits } from 'airthings-consumer-api';
import { API, CharacteristicProps, DynamicPlatformPlugin, Formats, Logging, Perms, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { AirthingsDeviceInfo, getAirthingsDeviceInfoBySerialNumber } from './device.js';

const PLUGIN_NAME = 'homebridge-airthings';
const PLATFORM_NAME = 'Airthings';

export class AirthingsPlatform implements DynamicPlatformPlugin {
    private readonly accessories: PlatformAccessory[] = [];
    private readonly airthingsClient?: AirthingsClient;

    constructor(public readonly log: Logging, public readonly config: AirthingsPlatformConfig, public readonly api: API) {
        if (!config) {
            this.log.warn('No configuration found for Airthings platform.');
            return;
        }

        if (!config.clientId) {
            this.log.error('Missing required config value: clientId');
        }

        if (!config.clientSecret) {
            this.log.error('Missing required config value: clientSecret');
        }

        if (config.clientId && config.clientSecret) {
            this.airthingsClient = new AirthingsClient({
                clientId: config.clientId,
                clientSecret: config.clientSecret
            });
        }

        this.api.on('didFinishLaunching', () => {
            this.discoverDevices();
        });
    }

    public get Service() {
        return this.api.hap.Service;
    }

    public get Characteristic() {
        return this.api.hap.Characteristic;
    }

    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }

    private discoverDevices() {
        if (!this.airthingsClient) {
            this.log.error('Unable to initialize Airthings client. Devices will not be registered.');
            return;
        }

        const devices = this.config.devices ?? [];

        if (devices.length === 0) {
            this.log.warn('No Airthings devices configured.');
            return;
        }

        const configuredUuids = new Set<string>();

        for (const device of devices) {
            if (!device.serialNumber) {
                this.log.error('Missing required config value: serialNumber');
                continue;
            }

            const normalizedConfig = this.normalizeDeviceConfig(device);
            const uuid = this.api.hap.uuid.generate(normalizedConfig.serialNumber);

            configuredUuids.add(uuid);

            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

            if (existingAccessory) {
                existingAccessory.context.device = normalizedConfig;
                new AirthingsAccessory(this, existingAccessory, this.airthingsClient, normalizedConfig);
                this.api.updatePlatformAccessories([existingAccessory]);
            }
            else {
                const accessory = new this.api.platformAccessory(normalizedConfig.name, uuid);
                accessory.context.device = normalizedConfig;
                new AirthingsAccessory(this, accessory, this.airthingsClient, normalizedConfig);

                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
        }

        const staleAccessories = this.accessories.filter(accessory => !configuredUuids.has(accessory.UUID));

        if (staleAccessories.length > 0) {
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleAccessories);
        }
    }

    private normalizeDeviceConfig(device: AirthingsAccessoryConfig): AirthingsAccessoryConfig {
        const config: AirthingsAccessoryConfig = {
            ...device,
            debug: device.debug ?? this.config.debug ?? false,
            refreshInterval: device.refreshInterval ?? this.config.refreshInterval ?? 150
        };

        if (!config.co2DetectedThreshold) {
            config.co2DetectedThreshold = 1000;
        }

        if (!Number.isSafeInteger(config.co2DetectedThreshold)) {
            this.log.warn('Invalid config value: co2DetectedThreshold (not a valid integer)');
            config.co2DetectedThreshold = 1000;
        }

        if (config.radonLeakThreshold != undefined && !Number.isSafeInteger(config.radonLeakThreshold)) {
            this.log.warn('Invalid config value: radonLeakThreshold (not a valid integer)');
            config.radonLeakThreshold = undefined;
        }

        if (!config.refreshInterval) {
            config.refreshInterval = 150;
        }

        if (!Number.isSafeInteger(config.refreshInterval)) {
            this.log.warn('Invalid config value: refreshInterval (not a valid integer)');
            config.refreshInterval = 150;
        }

        if (config.refreshInterval < 60) {
            this.log.warn('Invalid config value: refreshInterval (<60s may cause rate limiting)');
            config.refreshInterval = 60;
        }

        return config;
    }
}

class AirthingsAccessory {
    private readonly log: Logging;
    private readonly airthingsDevice: AirthingsDeviceInfo;

    private readonly informationService: Service;
    private batteryService?: Service;
    private airQualityService!: Service;
    private temperatureService?: Service;
    private humidityService?: Service;
    private carbonDioxideService?: Service;
    private airPressureService?: Service;
    private radonService?: Service;

    private lastSensorResult: SensorResult = {
        serialNumber: '',
        sensors: []
    };

    constructor(
        private readonly platform: AirthingsPlatform,
        private readonly accessory: PlatformAccessory,
        private readonly airthingsClient: AirthingsClient,
        private readonly airthingsConfig: AirthingsAccessoryConfig
    ) {
        this.log = platform.log;
        this.airthingsDevice = getAirthingsDeviceInfoBySerialNumber(airthingsConfig.serialNumber);

        this.accessory.context.serialNumber = airthingsConfig.serialNumber;

        this.informationService = this.accessory.getService(this.platform.Service.AccessoryInformation)
            ?? this.accessory.addService(this.platform.Service.AccessoryInformation);

        this.informationService
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Airthings')
            .setCharacteristic(this.platform.Characteristic.Model, this.airthingsDevice.model)
            .setCharacteristic(this.platform.Characteristic.Name, airthingsConfig.name)
            .setCharacteristic(this.platform.Characteristic.SerialNumber, airthingsConfig.serialNumber)
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, 'Unknown');

        this.configureServices();

        this.log.info(`Device Model: ${this.airthingsDevice.model}`);
        this.log.info(`Serial Number: ${this.airthingsConfig.serialNumber}`);

        this.log.info('Sensor Settings:');
        this.log.info(` * CO₂ Detected Threshold: ${this.airthingsConfig.co2DetectedThreshold} ppm`);
        this.log.info(` * Radon Leak Sensor: ${this.airthingsDevice.sensors.radonShortTermAvg ? (this.airthingsConfig.radonLeakThreshold ? 'Enabled' : 'Disabled') : 'Not Supported'}`);
        if (this.airthingsDevice.sensors.radonShortTermAvg && this.airthingsConfig.radonLeakThreshold) {
            this.log.info(` * Radon Leak Threshold: ${this.airthingsConfig.radonLeakThreshold} Bq/m³`);
        }

        this.log.info('Advanced Settings:');
        this.log.info(` * Debug Logging: ${this.airthingsConfig.debug}`);
        this.log.info(` * Refresh Interval: ${this.airthingsConfig.refreshInterval}s`);

        this.refreshCharacteristics();
        const refreshIntervalMs = (this.airthingsConfig.refreshInterval ?? 150) * 1000;
        setInterval(async () => {
            await this.refreshCharacteristics();
        }, refreshIntervalMs);
    }

    private configureServices() {
        const { Service, Characteristic } = this.platform;

        if (!this.airthingsConfig.batteryDisabled) {
            this.batteryService = this.accessory.getService(Service.Battery)
                ?? this.accessory.addService(Service.Battery, 'Battery');
        }
        else {
            const existingBatteryService = this.accessory.getService(Service.Battery);

            if (existingBatteryService) {
                this.accessory.removeService(existingBatteryService);
            }
        }

        this.airQualityService = this.accessory.getService(Service.AirQualitySensor)
            ?? this.accessory.addService(Service.AirQualitySensor, 'Air Quality');

        if (this.airthingsDevice.sensors.co2 && !this.airthingsConfig.co2AirQualityDisabled) {
            this.airQualityService.getCharacteristic(Characteristic.CarbonDioxideLevel).setProps({});
        }

        if (this.airthingsDevice.sensors.humidity && !this.airthingsConfig.humidityAirQualityDisabled) {
            this.airQualityService.getCharacteristic(Characteristic.CurrentRelativeHumidity).setProps({});
        }

        if (this.airthingsDevice.sensors.pm25 && !this.airthingsConfig.pm25AirQualityDisabled) {
            this.airQualityService.getCharacteristic(Characteristic.PM2_5Density).setProps({
                unit: 'µg/m³'
            });
        }

        if (this.airthingsDevice.sensors.radonShortTermAvg && !this.airthingsConfig.radonAirQualityDisabled) {
            this.ensureCustomCharacteristic(this.airQualityService, 'Radon', 'B42E01AA-ADE7-11E4-89D3-123B93F75CBA', {
                format: Formats.UINT16,
                perms: [Perms.NOTIFY, Perms.PAIRED_READ],
                unit: 'Bq/m³',
                minValue: 0,
                maxValue: 65535,
                minStep: 1
            });
        }

        if (this.airthingsDevice.sensors.voc && !this.airthingsConfig.vocAirQualityDisabled) {
            this.airQualityService.getCharacteristic(Characteristic.VOCDensity).setProps({
                unit: 'µg/m³',
                maxValue: 65535
            });

            this.ensureCustomCharacteristic(this.airQualityService, 'VOC Density (ppb)', 'E5B6DA60-E041-472A-BE2B-8318B8A724C5', {
                format: Formats.UINT16,
                perms: [Perms.NOTIFY, Perms.PAIRED_READ],
                unit: 'ppb',
                minValue: 0,
                maxValue: 65535,
                minStep: 1
            });
        }

        if (this.airthingsDevice.sensors.temp) {
            this.temperatureService = this.accessory.getService(Service.TemperatureSensor)
                ?? this.accessory.addService(Service.TemperatureSensor, 'Temp');
        }
        else {
            const existingTemperatureService = this.accessory.getService(Service.TemperatureSensor);

            if (existingTemperatureService) {
                this.accessory.removeService(existingTemperatureService);
            }
        }

        if (this.airthingsDevice.sensors.humidity) {
            this.humidityService = this.accessory.getService(Service.HumiditySensor)
                ?? this.accessory.addService(Service.HumiditySensor, 'Humidity');
        }
        else {
            const existingHumidityService = this.accessory.getService(Service.HumiditySensor);

            if (existingHumidityService) {
                this.accessory.removeService(existingHumidityService);
            }
        }

        if (this.airthingsDevice.sensors.co2) {
            this.carbonDioxideService = this.accessory.getService(Service.CarbonDioxideSensor)
                ?? this.accessory.addService(Service.CarbonDioxideSensor, 'CO2');
        }
        else {
            const existingCarbonDioxideService = this.accessory.getService(Service.CarbonDioxideSensor);

            if (existingCarbonDioxideService) {
                this.accessory.removeService(existingCarbonDioxideService);
            }
        }

        if (this.airthingsDevice.sensors.pressure) {
            const existingAirPressureService = this.accessory.services.find(service => service.UUID === 'e863f00a-079e-48ff-8f27-9c2605a29f52');

            this.airPressureService = existingAirPressureService
                ?? this.accessory.addService(new this.platform.api.hap.Service('Air Pressure', 'e863f00a-079e-48ff-8f27-9c2605a29f52'));

            this.ensureCustomCharacteristic(this.airPressureService, 'Air Pressure', 'e863f10f-079e-48ff-8f27-9c2605a29f52', {
                format: Formats.UINT16,
                perms: [Perms.NOTIFY, Perms.PAIRED_READ],
                unit: 'mBar',
                minValue: 0,
                maxValue: 1200,
                minStep: 1
            });

            if (!this.airPressureService.testCharacteristic(Characteristic.StatusActive)) {
                this.airPressureService.addCharacteristic(Characteristic.StatusActive);
            }
        }
        else {
            const existingAirPressureService = this.accessory.services.find(service => service.UUID === 'e863f00a-079e-48ff-8f27-9c2605a29f52');

            if (existingAirPressureService) {
                this.accessory.removeService(existingAirPressureService);
            }
        }

        if (this.airthingsDevice.sensors.radonShortTermAvg && this.airthingsConfig.radonLeakThreshold != undefined) {
            this.radonService = this.accessory.getService(Service.LeakSensor)
                ?? this.accessory.addService(Service.LeakSensor, 'Radon');
        }
        else {
            const existingRadonService = this.accessory.getService(Service.LeakSensor);

            if (existingRadonService) {
                this.accessory.removeService(existingRadonService);
            }
        }
    }

    private ensureCustomCharacteristic(service: Service, displayName: string, uuid: string, props: CharacteristicProps) {
        const existing = service.characteristics.find(characteristic => characteristic.UUID === uuid);

        if (existing) {
            return existing;
        }

        return service.addCharacteristic(new this.platform.api.hap.Characteristic(displayName, uuid, props));
    }

    private async getLatestSensorResult() {
        if (this.airthingsConfig.serialNumber == undefined) {
            return;
        }

        try {
            const sensorResults = await this.airthingsClient.getSensors(SensorUnits.Metric, [this.airthingsConfig.serialNumber]);

            if (sensorResults.results.length === 0) {
                this.log.error('No sensor results found!');
                return;
            }

            if (sensorResults.results[0]) {
                this.lastSensorResult = sensorResults.results[0];

                if (this.airthingsConfig.debug) {
                    this.log.info(JSON.stringify(this.lastSensorResult));
                }
            }
        }
        catch (err) {
            if (err instanceof Error) {
                this.log.error(err.message);
            }
        }
    }

    private async refreshCharacteristics() {
        await this.getLatestSensorResult();

        const co2Sensor = this.lastSensorResult.sensors.find(x => x.sensorType === 'co2');
        const humiditySensor = this.lastSensorResult.sensors.find(x => x.sensorType === 'humidity');
        const pm25Sensor = this.lastSensorResult.sensors.find(x => x.sensorType === 'pm25');
        const pressureSensor = this.lastSensorResult.sensors.find(x => x.sensorType === 'pressure');
        const radonShortTermAvgSensor = this.lastSensorResult.sensors.find(x => x.sensorType === 'radonShortTermAvg');
        const tempSensor = this.lastSensorResult.sensors.find(x => x.sensorType === 'temp');
        const vocSensor = this.lastSensorResult.sensors.find(x => x.sensorType === 'voc');

        const lastSensorResultRecordedAt = this.lastSensorResult.recorded ? Math.floor(new Date(this.lastSensorResult.recorded).getTime()) : undefined;

        if (this.batteryService && this.lastSensorResult.batteryPercentage) {
            this.batteryService.getCharacteristic(this.platform.Characteristic.BatteryLevel).updateValue(this.lastSensorResult.batteryPercentage);
            this.batteryService.getCharacteristic(this.platform.Characteristic.StatusLowBattery).updateValue(
                this.lastSensorResult.batteryPercentage > 10
                    ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
                    : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
            );
        }

        this.airQualityService.getCharacteristic(this.platform.Characteristic.AirQuality).updateValue(
            this.getAirQuality(this.lastSensorResult)
        );

        if (co2Sensor && !this.airthingsConfig.co2AirQualityDisabled) {
            this.airQualityService.getCharacteristic(this.platform.Characteristic.CarbonDioxideLevel).updateValue(co2Sensor.value);
        }

        if (humiditySensor && !this.airthingsConfig.humidityAirQualityDisabled) {
            this.airQualityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity).updateValue(humiditySensor.value);
        }

        if (pm25Sensor && !this.airthingsConfig.pm25AirQualityDisabled) {
            this.airQualityService.getCharacteristic(this.platform.Characteristic.PM2_5Density).updateValue(pm25Sensor.value);
        }

        if (radonShortTermAvgSensor && !this.airthingsConfig.radonAirQualityDisabled) {
            this.airQualityService.getCharacteristic('Radon')?.updateValue(radonShortTermAvgSensor.value);
        }

        if (vocSensor && !this.airthingsConfig.vocAirQualityDisabled) {
            this.airQualityService.getCharacteristic(this.platform.Characteristic.VOCDensity)?.updateValue(
                vocSensor.value * 2.2727
            );
            this.airQualityService.getCharacteristic('VOC Density (ppb)')?.updateValue(vocSensor.value);
        }

        this.airQualityService.getCharacteristic(this.platform.Characteristic.StatusActive).updateValue(
            lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
        );

        if (this.temperatureService) {
            if (tempSensor) {
                this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature).updateValue(tempSensor.value);
                this.temperatureService.getCharacteristic(this.platform.Characteristic.StatusActive).updateValue(true);
            }
            else {
                this.temperatureService.getCharacteristic(this.platform.Characteristic.StatusActive).updateValue(
                    lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
                );
            }
        }

        if (this.humidityService) {
            if (humiditySensor) {
                this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity).updateValue(humiditySensor.value);
                this.humidityService.getCharacteristic(this.platform.Characteristic.StatusActive).updateValue(true);
            }
            else {
                this.humidityService.getCharacteristic(this.platform.Characteristic.StatusActive).updateValue(
                    lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
                );
            }
        }

        if (this.carbonDioxideService) {
            if (co2Sensor && this.airthingsConfig.co2DetectedThreshold) {
                this.carbonDioxideService.getCharacteristic(this.platform.Characteristic.CarbonDioxideDetected).updateValue(
                    co2Sensor.value < this.airthingsConfig.co2DetectedThreshold
                        ? this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL
                        : this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL
                );
                this.carbonDioxideService.getCharacteristic(this.platform.Characteristic.CarbonDioxideLevel).updateValue(co2Sensor.value);
                this.carbonDioxideService.getCharacteristic(this.platform.Characteristic.StatusActive).updateValue(true);
            }
            else {
                this.carbonDioxideService.getCharacteristic(this.platform.Characteristic.StatusActive).updateValue(
                    lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
                );
            }
        }

        if (this.airPressureService) {
            if (pressureSensor) {
                this.airPressureService.getCharacteristic('Air Pressure')?.updateValue(pressureSensor.value);
                this.airPressureService.getCharacteristic(this.platform.Characteristic.StatusActive).updateValue(true);
            }
            else {
                this.airPressureService.getCharacteristic(this.platform.Characteristic.StatusActive).updateValue(
                    lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
                );
            }
        }

        if (this.radonService) {
            if (radonShortTermAvgSensor && this.airthingsConfig.radonLeakThreshold) {
                this.radonService.getCharacteristic(this.platform.Characteristic.LeakDetected).updateValue(
                    radonShortTermAvgSensor.value < this.airthingsConfig.radonLeakThreshold
                        ? this.platform.Characteristic.LeakDetected.LEAK_NOT_DETECTED
                        : this.platform.Characteristic.LeakDetected.LEAK_DETECTED
                );
                this.radonService.getCharacteristic(this.platform.Characteristic.StatusActive).updateValue(true);
            }
            else {
                this.radonService.getCharacteristic(this.platform.Characteristic.StatusActive).updateValue(
                    lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
                );
            }
        }
    }

    private getAirQuality(lastResult: SensorResult) {
        let aq = this.platform.Characteristic.AirQuality.UNKNOWN;

        const co2Sensor = lastResult.sensors.find(x => x.sensorType === 'co2');
        if (co2Sensor && !this.airthingsConfig.co2AirQualityDisabled) {
            if (co2Sensor.value >= 1000) {
                aq = Math.max(aq, this.platform.Characteristic.AirQuality.POOR);
            }
            else if (co2Sensor.value >= 800) {
                aq = Math.max(aq, this.platform.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, this.platform.Characteristic.AirQuality.GOOD);
            }
        }

        const humiditySensor = lastResult.sensors.find(x => x.sensorType === 'humidity');
        if (humiditySensor && !this.airthingsConfig.humidityAirQualityDisabled) {
            if (humiditySensor.value < 25 || humiditySensor.value >= 70) {
                aq = Math.max(aq, this.platform.Characteristic.AirQuality.POOR);
            }
            else if (humiditySensor.value < 30 || humiditySensor.value >= 60) {
                aq = Math.max(aq, this.platform.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, this.platform.Characteristic.AirQuality.GOOD);
            }
        }

        const pm25Sensor = lastResult.sensors.find(x => x.sensorType === 'pm25');
        if (pm25Sensor && !this.airthingsConfig.pm25AirQualityDisabled) {
            if (pm25Sensor.value >= 25) {
                aq = Math.max(aq, this.platform.Characteristic.AirQuality.POOR);
            }
            else if (pm25Sensor.value >= 10) {
                aq = Math.max(aq, this.platform.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, this.platform.Characteristic.AirQuality.GOOD);
            }
        }

        const radonShortTermAvgSensor = lastResult.sensors.find(x => x.sensorType === 'radonShortTermAvg');
        if (radonShortTermAvgSensor && !this.airthingsConfig.radonAirQualityDisabled) {
            if (radonShortTermAvgSensor.value >= 150) {
                aq = Math.max(aq, this.platform.Characteristic.AirQuality.POOR);
            }
            else if (radonShortTermAvgSensor.value >= 100) {
                aq = Math.max(aq, this.platform.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, this.platform.Characteristic.AirQuality.GOOD);
            }
        }

        const vocSensor = lastResult.sensors.find(x => x.sensorType === 'voc');
        if (vocSensor && !this.airthingsConfig.vocAirQualityDisabled) {
            if (vocSensor.value >= 2000) {
                aq = Math.max(aq, this.platform.Characteristic.AirQuality.POOR);
            }
            else if (vocSensor.value >= 250) {
                aq = Math.max(aq, this.platform.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, this.platform.Characteristic.AirQuality.GOOD);
            }
        }

        return aq;
    }
}

interface AirthingsPlatformConfig extends PlatformConfig {
    clientId?: string;
    clientSecret?: string;
    devices?: AirthingsAccessoryConfig[];
    refreshInterval?: number;
    debug?: boolean;
}

interface AirthingsAccessoryConfig {
    name: string;
    serialNumber: string;
    batteryDisabled?: boolean;
    co2AirQualityDisabled?: boolean;
    humidityAirQualityDisabled?: boolean;
    pm25AirQualityDisabled?: boolean;
    radonAirQualityDisabled?: boolean;
    vocAirQualityDisabled?: boolean;
    co2DetectedThreshold?: number;
    radonLeakThreshold?: number | undefined;
    debug?: boolean;
    refreshInterval?: number;
}
