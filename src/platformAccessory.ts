import { AirthingsClient, SensorResult, SensorUnits } from 'airthings-consumer-api';
import { API, Formats, Logger, Perms, PlatformAccessory, Service } from 'homebridge';

import { AirthingsDeviceConfig } from './config.js';
import { AirthingsDeviceInfo, getAirthingsDeviceInfoBySerialNumber } from './device.js';
import { AirthingsPlatform } from './platform.js';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AirthingsPlatformAccessory {
    private readonly log: Logger;

    private readonly airthingsClient: AirthingsClient;
    private readonly airthingsConfig: AirthingsDeviceConfig;
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

    constructor(
        private readonly platform: AirthingsPlatform,
        private readonly accessory: PlatformAccessory
    ) {
        this.log = this.platform.log;

        // Get device config from accessory context
        this.airthingsConfig = this.accessory.context.device;

        if (!this.platform.config.clientId) {
            this.log.error('Missing required config value: clientId');
        }

        if (!this.platform.config.clientSecret) {
            this.log.error('Missing required config value: clientSecret');
        }

        if (!this.airthingsConfig.serialNumber) {
            this.log.error('Missing required config value: serialNumber');
            this.airthingsConfig.serialNumber = '0000000000';
        }

        if (!this.airthingsConfig.co2DetectedThreshold) {
            this.airthingsConfig.co2DetectedThreshold = 1000;
        }

        if (!Number.isSafeInteger(this.airthingsConfig.co2DetectedThreshold)) {
            this.log.warn('Invalid config value: co2DetectedThreshold (not a valid integer)');
            this.airthingsConfig.co2DetectedThreshold = 1000;
        }

        if (!this.airthingsConfig.refreshInterval) {
            this.airthingsConfig.refreshInterval = 150;
        }

        if (!Number.isSafeInteger(this.airthingsConfig.refreshInterval)) {
            this.log.warn('Invalid config value: refreshInterval (not a valid integer)');
            this.airthingsConfig.refreshInterval = 150;
        }

        this.airthingsDevice = getAirthingsDeviceInfoBySerialNumber(this.airthingsConfig.serialNumber);
        this.airthingsClient = new AirthingsClient({
            clientId: this.platform.config.clientId,
            clientSecret: this.platform.config.clientSecret
        });

        this.log.info('Device Settings:');
        this.log.info(` * Name: ${this.airthingsConfig.name}`);
        this.log.info(` * Model: ${this.airthingsDevice.model}`);
        this.log.info(` * Serial Number: ${this.airthingsConfig.serialNumber}`);

        this.log.info('Enabled Sensors:');
        this.log.info(` * Air Quality: true`);
        this.log.info(` * Battery: ${!this.airthingsConfig.batteryDisabled}`);
        this.log.info(` * Temperature: ${this.airthingsDevice.sensors.temp}`);
        this.log.info(` * Humidity: ${this.airthingsDevice.sensors.humidity}`);
        this.log.info(` * CO2: ${this.airthingsDevice.sensors.co2}`);
        this.log.info(` * Air Pressure: ${this.airthingsDevice.sensors.pressure}`);
        this.log.info(` * Radon: ${this.airthingsDevice.sensors.radonShortTermAvg && this.airthingsConfig.radonLeakThreshold != undefined}`);

        this.log.info('Advanced Settings:');
        this.log.info(` * Debug Logging: ${this.platform.config.debug}`);
        this.log.info(` * Refresh Interval: ${this.airthingsConfig.refreshInterval}s`);

        // Set accessory information
        this.informationService = this.accessory.getService(this.platform.api.hap.Service.AccessoryInformation)
            || this.accessory.addService(this.platform.api.hap.Service.AccessoryInformation);

        this.informationService
            .setCharacteristic(this.platform.api.hap.Characteristic.Manufacturer, 'Airthings')
            .setCharacteristic(this.platform.api.hap.Characteristic.Model, this.airthingsDevice.model)
            .setCharacteristic(this.platform.api.hap.Characteristic.Name, this.airthingsConfig.name)
            .setCharacteristic(this.platform.api.hap.Characteristic.SerialNumber, this.airthingsConfig.serialNumber)
            .setCharacteristic(this.platform.api.hap.Characteristic.FirmwareRevision, 'Unknown');

        // HomeKit Battery Service
        this.batteryService = this.accessory.getService(this.platform.api.hap.Service.Battery)
            || this.accessory.addService(this.platform.api.hap.Service.Battery, 'Battery');

        // HomeKit Air Quality Service
        this.airQualityService = this.accessory.getService(this.platform.api.hap.Service.AirQualitySensor)
            || this.accessory.addService(this.platform.api.hap.Service.AirQualitySensor, 'Air Quality');

        if (this.airthingsDevice.sensors.co2 && !this.airthingsConfig.co2AirQualityDisabled) {
            this.airQualityService.getCharacteristic(this.platform.api.hap.Characteristic.CarbonDioxideLevel).setProps({});
        }

        if (this.airthingsDevice.sensors.humidity && !this.airthingsConfig.humidityAirQualityDisabled) {
            this.airQualityService.getCharacteristic(this.platform.api.hap.Characteristic.CurrentRelativeHumidity).setProps({});
        }

        if (this.airthingsDevice.sensors.pm25 && !this.airthingsConfig.pm25AirQualityDisabled) {
            this.airQualityService.getCharacteristic(this.platform.api.hap.Characteristic.PM2_5Density).setProps({
                unit: 'µg/m³'
            });
        }

        if (this.airthingsDevice.sensors.radonShortTermAvg && !this.airthingsConfig.radonAirQualityDisabled) {
            this.airQualityService.addCharacteristic(new this.platform.api.hap.Characteristic('Radon', 'e963f10f-079e-48ff-8f27-9c2605a29f52', {
                format: Formats.FLOAT,
                perms: [Perms.NOTIFY, Perms.PAIRED_READ],
                unit: 'Bq/m³',
                minValue: 0,
                maxValue: 16383,
                minStep: 1
            }));
        }

        if (this.airthingsDevice.sensors.voc && !this.airthingsConfig.vocAirQualityDisabled) {
            this.airQualityService.getCharacteristic(this.platform.api.hap.Characteristic.VOCDensity)?.setProps({
                unit: 'µg/m³'
            });
        }

        // HomeKit Temperature Service
        this.temperatureService = this.accessory.getService(this.platform.api.hap.Service.TemperatureSensor)
            || this.accessory.addService(this.platform.api.hap.Service.TemperatureSensor, 'Temperature');

        // HomeKit Humidity Service
        this.humidityService = this.accessory.getService(this.platform.api.hap.Service.HumiditySensor)
            || this.accessory.addService(this.platform.api.hap.Service.HumiditySensor, 'Humidity');

        // HomeKit CO2 Service
        this.carbonDioxideService = this.accessory.getService(this.platform.api.hap.Service.CarbonDioxideSensor)
            || this.accessory.addService(this.platform.api.hap.Service.CarbonDioxideSensor, 'CO2');

        // Eve Air Pressure Service
        this.airPressureService = this.accessory.getService('Air Pressure')
            || this.accessory.addService(new this.platform.api.hap.Service('Air Pressure', 'e863f00a-079e-48ff-8f27-9c2605a29f52'));

        this.airPressureService.addCharacteristic(new this.platform.api.hap.Characteristic('Air Pressure', 'e863f10f-079e-48ff-8f27-9c2605a29f52', {
            format: Formats.UINT16,
            perms: [Perms.NOTIFY, Perms.PAIRED_READ],
            unit: 'mBar',
            minValue: 0,
            maxValue: 1200,
            minStep: 1
        }));

        this.airPressureService.addCharacteristic(this.platform.api.hap.Characteristic.StatusActive);

        // HomeKit Radon (Leak) Service
        this.radonService = this.accessory.getService(this.platform.api.hap.Service.LeakSensor)
            || this.accessory.addService(this.platform.api.hap.Service.LeakSensor, 'Radon');

        this.refreshCharacteristics(this.platform.api);
        setInterval(async () => {
            await this.refreshCharacteristics(this.platform.api);
        }, (this.airthingsConfig.refreshInterval || 150) * 1000);
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

            if (this.platform.config.debug) {
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
            this.batteryService.getCharacteristic(api.hap.Characteristic.ChargingState).updateValue(
                api.hap.Characteristic.ChargingState.NOT_CHARGEABLE
            );
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
        const humiditySensor = lastResult.sensors.find(x => x.sensorType === 'humidity');
        const pm25Sensor = lastResult.sensors.find(x => x.sensorType === 'pm25');
        const radonShortTermAvgSensor = lastResult.sensors.find(x => x.sensorType === 'radonShortTermAvg');
        const vocSensor = lastResult.sensors.find(x => x.sensorType === 'voc');

        if (lastResult.sensors.length > 0) {
            aq = api.hap.Characteristic.AirQuality.EXCELLENT;
        }

        if (co2Sensor && !this.airthingsConfig.co2AirQualityDisabled) {
            if (co2Sensor.value > 5000) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
            }
            else if (co2Sensor.value > 2000) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.INFERIOR);
            }
            else if (co2Sensor.value > 1000) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        if (humiditySensor && !this.airthingsConfig.humidityAirQualityDisabled) {
            if (humiditySensor.value > 70 || humiditySensor.value < 25) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
            }
            else if (humiditySensor.value > 65 || humiditySensor.value < 30) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.INFERIOR);
            }
            else if (humiditySensor.value > 60 || humiditySensor.value < 35) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        if (pm25Sensor && !this.airthingsConfig.pm25AirQualityDisabled) {
            if (pm25Sensor.value > 250) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
            }
            else if (pm25Sensor.value > 150) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.INFERIOR);
            }
            else if (pm25Sensor.value > 55) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        if (radonShortTermAvgSensor && !this.airthingsConfig.radonAirQualityDisabled) {
            if (radonShortTermAvgSensor.value > 600) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
            }
            else if (radonShortTermAvgSensor.value > 300) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.INFERIOR);
            }
            else if (radonShortTermAvgSensor.value > 150) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        if (vocSensor && !this.airthingsConfig.vocAirQualityDisabled) {
            if (vocSensor.value > 2000) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.POOR);
            }
            else if (vocSensor.value > 250) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.INFERIOR);
            }
            else if (vocSensor.value > 125) {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        return aq;
    }
}

export interface AirthingsPlatformAccessoryContext {
    device: AirthingsDeviceConfig;
}
