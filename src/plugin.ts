import { AirthingsApi, AirthingsApiDeviceSample } from './api.js';
import { AirthingsDeviceInfo, getAirthingsDeviceInfoBySerialNumber } from './device.js';
import { AccessoryConfig, AccessoryPlugin, API, Formats, Logging, Perms, Service } from 'homebridge';

export class AirthingsPlugin implements AccessoryPlugin {
    private readonly log: Logging;
    private readonly timer: NodeJS.Timer;

    private readonly airthingsApi: AirthingsApi;
    private readonly airthingsConfig: AirthingsPluginConfig;
    private readonly airthingsDevice: AirthingsDeviceInfo;

    private readonly informationService: Service;
    private readonly batteryService: Service;
    private readonly airQualityService: Service;
    private readonly temperatureService: Service;
    private readonly humidityService: Service;
    private readonly carbonDioxideService: Service;
    private readonly airPressureService: Service;
    private readonly radonService: Service;

    private latestSamples: AirthingsApiDeviceSample = {
        data: {}
    };

    constructor(log: Logging, config: AirthingsPluginConfig, api: API) {
        this.log = log;

        if (!config.clientId) {
            this.log.error('Missing required config value: clientId');
        }

        if (!config.clientSecret) {
            this.log.error('Missing required config value: clientSecret');
        }

        if (!config.serialNumber) {
            this.log.error('Missing required config value: serialNumber');
            config.serialNumber = '0000000000';
        }

        if (!config.co2DetectedThreshold) {
            config.co2DetectedThreshold = 1000;
        }

        if (!Number.isSafeInteger(config.co2DetectedThreshold)) {
            this.log.warn('Invalid config value: co2DetectedThreshold (not a valid integer)');
            config.co2DetectedThreshold = 1000;
        }

        if (config.radonLeakThreshold && !Number.isSafeInteger(config.radonLeakThreshold)) {
            this.log.warn('Invalid config value: radonLeakThreshold (not a valid integer)');
            config.radonLeakThreshold = undefined;
        }

        if (!config.debug) {
            config.debug = false;
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

        if (!config.tokenScope) {
            config.tokenScope = 'read:device:current_values';
        }

        this.airthingsApi = new AirthingsApi(config.tokenScope, config.clientId, config.clientSecret);
        this.airthingsConfig = config;
        this.airthingsDevice = getAirthingsDeviceInfoBySerialNumber(config.serialNumber);

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
        this.log.info(` * Token Scope: ${this.airthingsConfig.tokenScope}`);

        // HomeKit Accessory Information Service
        this.informationService = new api.hap.Service.AccessoryInformation()
            .setCharacteristic(api.hap.Characteristic.Manufacturer, 'Airthings')
            .setCharacteristic(api.hap.Characteristic.Model, this.airthingsDevice.model)
            .setCharacteristic(api.hap.Characteristic.Name, config.name)
            .setCharacteristic(api.hap.Characteristic.SerialNumber, config.serialNumber)
            .setCharacteristic(api.hap.Characteristic.FirmwareRevision, 'Unknown');

        // HomeKit Battery Service
        this.batteryService = new api.hap.Service.Battery('Battery');

        // HomeKit Air Quality Service
        this.airQualityService = new api.hap.Service.AirQualitySensor('Air Quality');

        if (this.airthingsDevice.sensors.co2 && !this.airthingsConfig.co2AirQualityDisabled) {
            this.airQualityService.getCharacteristic(api.hap.Characteristic.CarbonDioxideLevel).setProps({});
        }

        if (this.airthingsDevice.sensors.humidity && !this.airthingsConfig.humidityAirQualityDisabled) {
            this.airQualityService.getCharacteristic(api.hap.Characteristic.CurrentRelativeHumidity).setProps({});
        }

        if (this.airthingsDevice.sensors.pm25 && !this.airthingsConfig.pm25AirQualityDisabled) {
            this.airQualityService.getCharacteristic(api.hap.Characteristic.PM2_5Density).setProps({
                unit: 'µg/m³'
            });
        }

        if (this.airthingsDevice.sensors.radonShortTermAvg && !this.airthingsConfig.radonAirQualityDisabled) {
            this.airQualityService.addCharacteristic(new api.hap.Characteristic('Radon', 'B42E01AA-ADE7-11E4-89D3-123B93F75CBA', {
                format: Formats.UINT16,
                perms: [Perms.NOTIFY, Perms.PAIRED_READ],
                unit: 'Bq/m³',
                minValue: 0,
                maxValue: 65535,
                minStep: 1
            }));
        }

        if (this.airthingsDevice.sensors.voc && !this.airthingsConfig.vocAirQualityDisabled) {
            this.airQualityService.getCharacteristic(api.hap.Characteristic.VOCDensity).setProps({
                unit: 'µg/m³',
                maxValue: 65535
            });

            this.airQualityService.addCharacteristic(new api.hap.Characteristic('VOC Density (ppb)', 'E5B6DA60-E041-472A-BE2B-8318B8A724C5', {
                format: Formats.UINT16,
                perms: [Perms.NOTIFY, Perms.PAIRED_READ],
                unit: 'ppb',
                minValue: 0,
                maxValue: 65535,
                minStep: 1
            }));
        }

        // HomeKit Temperature Service
        this.temperatureService = new api.hap.Service.TemperatureSensor('Temp');

        // HomeKit Humidity Service
        this.humidityService = new api.hap.Service.HumiditySensor('Humidity');

        // HomeKit CO2 Service
        this.carbonDioxideService = new api.hap.Service.CarbonDioxideSensor('CO2');

        // Eve Air Pressure Service
        this.airPressureService = new api.hap.Service('Air Pressure', 'e863f00a-079e-48ff-8f27-9c2605a29f52');

        this.airPressureService.addCharacteristic(new api.hap.Characteristic('Air Pressure', 'e863f10f-079e-48ff-8f27-9c2605a29f52', {
            format: Formats.UINT16,
            perms: [Perms.NOTIFY, Perms.PAIRED_READ],
            unit: 'mBar',
            minValue: 0,
            maxValue: 1200,
            minStep: 1
        }));

        this.airPressureService.addCharacteristic(api.hap.Characteristic.StatusActive);

        // HomeKit Radon (Leak) Service
        this.radonService = new api.hap.Service.LeakSensor('Radon');

        this.refreshCharacteristics(api);
        this.timer = setInterval(async () => {
            await this.refreshCharacteristics(api);
        }, config.refreshInterval * 1000);
    }

    getServices(): Service[] {
        const services = [this.informationService, this.batteryService, this.airQualityService];

        if (this.airthingsDevice.sensors.temp) {
            services.push(this.temperatureService);
        }

        if (this.airthingsDevice.sensors.humidity) {
            services.push(this.humidityService);
        }

        if (this.airthingsDevice.sensors.co2) {
            services.push(this.carbonDioxideService);
        }

        if (this.airthingsDevice.sensors.pressure) {
            services.push(this.airPressureService);
        }

        if (this.airthingsDevice.sensors.radonShortTermAvg && this.airthingsConfig.radonLeakThreshold != undefined) {
            services.push(this.radonService);
        }

        return services;
    }

    async getLatestSamples() {
        if (this.airthingsConfig.serialNumber == undefined) {
            return;
        }

        try {
            this.latestSamples = await this.airthingsApi.getLatestSamples(this.airthingsConfig.serialNumber);
            if (this.airthingsConfig.debug) {
                this.log.info(JSON.stringify(this.latestSamples.data));
            }
        }
        catch (err) {
            if (err instanceof Error) {
                this.log.error(err.message);
            }
        }
    }

    async refreshCharacteristics(api: API) {
        await this.getLatestSamples();

        // HomeKit Battery Service
        if (this.latestSamples.data.battery != undefined) {
            this.batteryService.getCharacteristic(api.hap.Characteristic.BatteryLevel).updateValue(this.latestSamples.data.battery);
            this.batteryService.getCharacteristic(api.hap.Characteristic.StatusLowBattery).updateValue(
                this.latestSamples.data.battery > 10
                    ? api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
                    : api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
            );
        }

        // HomeKit Air Quality Service
        this.airQualityService.getCharacteristic(api.hap.Characteristic.AirQuality).updateValue(
            this.getAirQuality(api, this.latestSamples)
        );

        if (this.latestSamples.data.co2 != undefined && !this.airthingsConfig.co2AirQualityDisabled) {
            this.airQualityService.getCharacteristic(api.hap.Characteristic.CarbonDioxideLevel).updateValue(this.latestSamples.data.co2);
        }

        if (this.latestSamples.data.humidity != undefined && !this.airthingsConfig.humidityAirQualityDisabled) {
            this.airQualityService.getCharacteristic(api.hap.Characteristic.CurrentRelativeHumidity).updateValue(this.latestSamples.data.humidity);
        }

        if (this.latestSamples.data.pm25 != undefined && !this.airthingsConfig.pm25AirQualityDisabled) {
            this.airQualityService.getCharacteristic(api.hap.Characteristic.PM2_5Density).updateValue(this.latestSamples.data.pm25);
        }

        if (this.latestSamples.data.radonShortTermAvg != undefined && !this.airthingsConfig.radonAirQualityDisabled) {
            this.airQualityService.getCharacteristic('Radon')?.updateValue(this.latestSamples.data.radonShortTermAvg);
        }

        if (this.latestSamples.data.voc != undefined && !this.airthingsConfig.vocAirQualityDisabled) {
            this.airQualityService.getCharacteristic(api.hap.Characteristic.VOCDensity)?.updateValue(
                this.latestSamples.data.voc * 2.2727
            );
            this.airQualityService.getCharacteristic('VOC Density (ppb)')?.updateValue(this.latestSamples.data.voc);
        }

        this.airQualityService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
            this.latestSamples.data.time != undefined && Date.now() / 1000 - this.latestSamples.data.time < 2 * 60 * 60
        );

        // HomeKit Temperature Service
        if (this.latestSamples.data.temp != undefined) {
            this.temperatureService.getCharacteristic(api.hap.Characteristic.CurrentTemperature).updateValue(this.latestSamples.data.temp);
            this.temperatureService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(true);
        }
        else {
            this.temperatureService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
                this.latestSamples.data.time != undefined && Date.now() / 1000 - this.latestSamples.data.time < 2 * 60 * 60
            );
        }

        // HomeKit Humidity Service
        if (this.latestSamples.data.humidity != undefined) {
            this.humidityService.getCharacteristic(api.hap.Characteristic.CurrentRelativeHumidity).updateValue(this.latestSamples.data.humidity);
            this.humidityService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(true);
        }
        else {
            this.humidityService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
                this.latestSamples.data.time != undefined && Date.now() / 1000 - this.latestSamples.data.time < 2 * 60 * 60
            );
        }

        // HomeKit CO2 Service
        if (this.latestSamples.data.co2 != undefined && this.airthingsConfig.co2DetectedThreshold) {
            this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.CarbonDioxideDetected).updateValue(
                this.latestSamples.data.co2 < this.airthingsConfig.co2DetectedThreshold
                    ? api.hap.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL
                    : api.hap.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL
            );
            this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.CarbonDioxideLevel).updateValue(this.latestSamples.data.co2);
            this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(true);
        }
        else {
            this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
                this.latestSamples.data.time != undefined && Date.now() / 1000 - this.latestSamples.data.time < 2 * 60 * 60
            );
        }

        // Eve Air Pressure Service
        if (this.latestSamples.data.pressure != undefined) {
            this.airPressureService.getCharacteristic('Air Pressure')?.updateValue(this.latestSamples.data.pressure);
            this.airPressureService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(true);
        }
        else {
            this.airPressureService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
                this.latestSamples.data.time != undefined && Date.now() / 1000 - this.latestSamples.data.time < 2 * 60 * 60
            );
        }

        // HomeKit Radon (Leak) Service
        if (this.latestSamples.data.radonShortTermAvg != undefined && this.airthingsConfig.radonLeakThreshold) {
            this.radonService.getCharacteristic(api.hap.Characteristic.LeakDetected).updateValue(
                this.latestSamples.data.radonShortTermAvg < this.airthingsConfig.radonLeakThreshold
                    ? api.hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED
                    : api.hap.Characteristic.LeakDetected.LEAK_DETECTED
            );
            this.radonService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(true);
        }
        else {
            this.radonService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
                this.latestSamples.data.time != undefined && Date.now() / 1000 - this.latestSamples.data.time < 2 * 60 * 60
            );
        }
    }

    getAirQuality(api: API, latestSamples: AirthingsApiDeviceSample) {
        let aq = api.hap.Characteristic.AirQuality.UNKNOWN;

        const co2 = latestSamples.data.co2;
        if (co2 != undefined && !this.airthingsConfig.co2AirQualityDisabled) {
            if (co2 >= 1000) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
            }
            else if (co2 >= 800) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        const humidity = latestSamples.data.humidity;
        if (humidity != undefined && !this.airthingsConfig.humidityAirQualityDisabled) {
            if (humidity < 25 || humidity >= 70) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
            }
            else if (humidity < 30 || humidity >= 60) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        const pm25 = latestSamples.data.pm25;
        if (pm25 != undefined && !this.airthingsConfig.pm25AirQualityDisabled) {
            if (pm25 >= 25) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
            }
            else if (pm25 >= 10) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        const radonShortTermAvg = latestSamples.data.radonShortTermAvg;
        if (radonShortTermAvg != undefined && !this.airthingsConfig.radonAirQualityDisabled) {
            if (radonShortTermAvg >= 150) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
            }
            else if (radonShortTermAvg >= 100) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        const voc = latestSamples.data.voc;
        if (voc != undefined && !this.airthingsConfig.vocAirQualityDisabled) {
            if (voc >= 2000) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
            }
            else if (voc >= 250) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        return aq;
    }
}

interface AirthingsPluginConfig extends AccessoryConfig {
    clientId?: string;
    clientSecret?: string;
    serialNumber?: string;
    co2AirQualityDisabled?: boolean;
    humidityAirQualityDisabled?: boolean;
    pm25AirQualityDisabled?: boolean;
    radonAirQualityDisabled?: boolean;
    vocAirQualityDisabled?: boolean;
    co2DetectedThreshold?: number;
    radonLeakThreshold?: number;
    debug?: boolean;
    refreshInterval?: number;
    tokenScope?: string;
}
