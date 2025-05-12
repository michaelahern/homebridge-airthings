import { AirthingsClient, SensorResult, SensorUnits } from 'airthings-consumer-api';
import { AccessoryConfig, AccessoryPlugin, API, Formats, Logging, Perms, Service } from 'homebridge';

import { AirthingsDeviceInfo, getAirthingsDeviceInfoBySerialNumber } from './device.js';

export class AirthingsPlugin implements AccessoryPlugin {
    private readonly log: Logging;

    private readonly airthingsClient: AirthingsClient;
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

    private lastSensorResult: SensorResult = {
        serialNumber: '',
        sensors: []
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

        this.airthingsClient = new AirthingsClient({
            clientId: config.clientId ?? '',
            clientSecret: config.clientSecret ?? ''
        });
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
        setInterval(async () => {
            await this.refreshCharacteristics(api);
        }, config.refreshInterval * 1000);
    }

    getServices(): Service[] {
        const services = [this.informationService, this.airQualityService];

        if (!this.airthingsConfig.batteryDisabled) {
            services.push(this.batteryService);
        }

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

    async getLatestSensorResult() {
        if (this.airthingsConfig.serialNumber == undefined) {
            return;
        }

        try {
            const sensorResults = await this.airthingsClient.getSensors(SensorUnits.Metric, [this.airthingsConfig.serialNumber]);

            if (sensorResults.results.length === 0) {
                this.log.error('No sensor results found!');
                return;
            }

            this.lastSensorResult = sensorResults.results[0];

            if (this.airthingsConfig.debug) {
                this.log.info(JSON.stringify(this.lastSensorResult));
            }
        }
        catch (err) {
            if (err instanceof Error) {
                this.log.error(err.message);
            }
        }
    }

    async refreshCharacteristics(api: API) {
        await this.getLatestSensorResult();

        const co2Sensor = this.lastSensorResult.sensors.find(x => x.sensorType === 'co2');
        const humiditySensor = this.lastSensorResult.sensors.find(x => x.sensorType === 'humidity');
        const pm25Sensor = this.lastSensorResult.sensors.find(x => x.sensorType === 'pm25');
        const pressureSensor = this.lastSensorResult.sensors.find(x => x.sensorType === 'pressure');
        const radonShortTermAvgSensor = this.lastSensorResult.sensors.find(x => x.sensorType === 'radonShortTermAvg');
        const tempSensor = this.lastSensorResult.sensors.find(x => x.sensorType === 'temp');
        const vocSensor = this.lastSensorResult.sensors.find(x => x.sensorType === 'voc');

        const lastSensorResultRecordedAt = this.lastSensorResult.recorded ? Math.floor(new Date(this.lastSensorResult.recorded).getTime()) : undefined;

        // HomeKit Battery Service
        if (this.lastSensorResult.batteryPercentage) {
            this.batteryService.getCharacteristic(api.hap.Characteristic.BatteryLevel).updateValue(this.lastSensorResult.batteryPercentage);
            this.batteryService.getCharacteristic(api.hap.Characteristic.StatusLowBattery).updateValue(
                this.lastSensorResult.batteryPercentage > 10
                    ? api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
                    : api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
            );
        }

        // HomeKit Air Quality Service
        this.airQualityService.getCharacteristic(api.hap.Characteristic.AirQuality).updateValue(
            this.getAirQuality(api, this.lastSensorResult)
        );

        if (co2Sensor && !this.airthingsConfig.co2AirQualityDisabled) {
            this.airQualityService.getCharacteristic(api.hap.Characteristic.CarbonDioxideLevel).updateValue(co2Sensor.value);
        }

        if (humiditySensor && !this.airthingsConfig.humidityAirQualityDisabled) {
            this.airQualityService.getCharacteristic(api.hap.Characteristic.CurrentRelativeHumidity).updateValue(humiditySensor.value);
        }

        if (pm25Sensor && !this.airthingsConfig.pm25AirQualityDisabled) {
            this.airQualityService.getCharacteristic(api.hap.Characteristic.PM2_5Density).updateValue(pm25Sensor.value);
        }

        if (radonShortTermAvgSensor && !this.airthingsConfig.radonAirQualityDisabled) {
            this.airQualityService.getCharacteristic('Radon')?.updateValue(radonShortTermAvgSensor.value);
        }

        if (vocSensor && !this.airthingsConfig.vocAirQualityDisabled) {
            this.airQualityService.getCharacteristic(api.hap.Characteristic.VOCDensity)?.updateValue(
                vocSensor.value * 2.2727
            );
            this.airQualityService.getCharacteristic('VOC Density (ppb)')?.updateValue(vocSensor.value);
        }

        this.airQualityService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
            lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
        );

        // HomeKit Temperature Service
        if (tempSensor) {
            this.temperatureService.getCharacteristic(api.hap.Characteristic.CurrentTemperature).updateValue(tempSensor.value);
            this.temperatureService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(true);
        }
        else {
            this.temperatureService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
                lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
            );
        }

        // HomeKit Humidity Service
        if (humiditySensor) {
            this.humidityService.getCharacteristic(api.hap.Characteristic.CurrentRelativeHumidity).updateValue(humiditySensor.value);
            this.humidityService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(true);
        }
        else {
            this.humidityService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
                lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
            );
        }

        // HomeKit CO2 Service
        if (co2Sensor && this.airthingsConfig.co2DetectedThreshold) {
            this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.CarbonDioxideDetected).updateValue(
                co2Sensor.value < this.airthingsConfig.co2DetectedThreshold
                    ? api.hap.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL
                    : api.hap.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL
            );
            this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.CarbonDioxideLevel).updateValue(co2Sensor.value);
            this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(true);
        }
        else {
            this.carbonDioxideService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
                lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
            );
        }

        // Eve Air Pressure Service
        if (pressureSensor) {
            this.airPressureService.getCharacteristic('Air Pressure')?.updateValue(pressureSensor.value);
            this.airPressureService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(true);
        }
        else {
            this.airPressureService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
                lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
            );
        }

        // HomeKit Radon (Leak) Service
        if (radonShortTermAvgSensor && this.airthingsConfig.radonLeakThreshold) {
            this.radonService.getCharacteristic(api.hap.Characteristic.LeakDetected).updateValue(
                radonShortTermAvgSensor.value < this.airthingsConfig.radonLeakThreshold
                    ? api.hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED
                    : api.hap.Characteristic.LeakDetected.LEAK_DETECTED
            );
            this.radonService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(true);
        }
        else {
            this.radonService.getCharacteristic(api.hap.Characteristic.StatusActive).updateValue(
                lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
            );
        }
    }

    getAirQuality(api: API, lastResult: SensorResult) {
        let aq = api.hap.Characteristic.AirQuality.UNKNOWN;

        const co2Sensor = lastResult.sensors.find(x => x.sensorType === 'co2');
        if (co2Sensor && !this.airthingsConfig.co2AirQualityDisabled) {
            if (co2Sensor.value >= 1000) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
            }
            else if (co2Sensor.value >= 800) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        const humiditySensor = lastResult.sensors.find(x => x.sensorType === 'humidity');
        if (humiditySensor && !this.airthingsConfig.humidityAirQualityDisabled) {
            if (humiditySensor.value < 25 || humiditySensor.value >= 70) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
            }
            else if (humiditySensor.value < 30 || humiditySensor.value >= 60) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        const pm25Sensor = lastResult.sensors.find(x => x.sensorType === 'pm25');
        if (pm25Sensor && !this.airthingsConfig.pm25AirQualityDisabled) {
            if (pm25Sensor.value >= 25) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
            }
            else if (pm25Sensor.value >= 10) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        const radonShortTermAvgSensor = lastResult.sensors.find(x => x.sensorType === 'radonShortTermAvg');
        if (radonShortTermAvgSensor && !this.airthingsConfig.radonAirQualityDisabled) {
            if (radonShortTermAvgSensor.value >= 150) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
            }
            else if (radonShortTermAvgSensor.value >= 100) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        const vocSensor = lastResult.sensors.find(x => x.sensorType === 'voc');
        if (vocSensor && !this.airthingsConfig.vocAirQualityDisabled) {
            if (vocSensor.value >= 2000) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
            }
            else if (vocSensor.value >= 250) {
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
    batteryDisabled?: boolean;
    co2AirQualityDisabled?: boolean;
    humidityAirQualityDisabled?: boolean;
    pm25AirQualityDisabled?: boolean;
    radonAirQualityDisabled?: boolean;
    vocAirQualityDisabled?: boolean;
    co2DetectedThreshold?: number;
    radonLeakThreshold?: number;
    debug?: boolean;
    refreshInterval?: number;
}
