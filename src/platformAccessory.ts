import { AirthingsClient, SensorResult, SensorUnits } from 'airthings-consumer-api';
import { CharacteristicValue, Logger, PlatformAccessory, Service } from 'homebridge';

interface AirthingsSensor {
    sensorType: string;
    value: number;
}

import { AirthingsDeviceConfig } from './config.js';
import { AirthingsDeviceInfo, getAirthingsDeviceInfoBySerialNumber } from './device.js';
import { AirthingsPlatform } from './platform.js';

export interface AirthingsPlatformAccessoryContext {
    deviceConfig: AirthingsDeviceConfig;
}

export class AirthingsPlatformAccessory {
    private readonly log: Logger;
    private readonly context: AirthingsPlatformAccessoryContext;
    private readonly logPrefix: string;

    private readonly airthingsClient: AirthingsClient;
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
        private readonly accessory: PlatformAccessory,
        private readonly deviceConfig: AirthingsDeviceConfig
    ) {
        this.log = this.platform.log;
        this.logPrefix = `[${this.accessory.displayName}]`;

        this.context = {
            deviceConfig: this.deviceConfig
        };
        this.accessory.context = this.context;

        this.airthingsClient = new AirthingsClient({
            clientId: this.deviceConfig.clientId,
            clientSecret: this.deviceConfig.clientSecret
        });
        this.airthingsDevice = getAirthingsDeviceInfoBySerialNumber(this.deviceConfig.serialNumber);

        this.log.info(`${this.logPrefix} Device Model: ${this.airthingsDevice.model}`);
        this.log.info(`${this.logPrefix} Serial Number: ${this.deviceConfig.serialNumber}`);

        this.log.info(`${this.logPrefix} Sensor Settings:`);
        this.log.info(`${this.logPrefix} * CO₂ Detected Threshold: ${this.deviceConfig.co2DetectedThreshold} ppm`);
        this.log.info(`${this.logPrefix} * Radon Leak Sensor: ${this.airthingsDevice.sensors.radonShortTermAvg ? (this.deviceConfig.radonLeakThreshold ? 'Enabled' : 'Disabled') : 'Not Supported'}`);
        if (this.airthingsDevice.sensors.radonShortTermAvg && this.deviceConfig.radonLeakThreshold) {
            this.log.info(`${this.logPrefix} * Radon Leak Threshold: ${this.deviceConfig.radonLeakThreshold} Bq/m³`);
        }

        this.informationService = this.accessory.getService(this.platform.api.hap.Service.AccessoryInformation)
            || this.accessory.addService(this.platform.api.hap.Service.AccessoryInformation);

        this.informationService
            .setCharacteristic(this.platform.api.hap.Characteristic.Manufacturer, 'Airthings')
            .setCharacteristic(this.platform.api.hap.Characteristic.Model, this.airthingsDevice.model)
            .setCharacteristic(this.platform.api.hap.Characteristic.Name, this.deviceConfig.name)
            .setCharacteristic(this.platform.api.hap.Characteristic.SerialNumber, this.deviceConfig.serialNumber)
            .setCharacteristic(this.platform.api.hap.Characteristic.FirmwareRevision, 'Unknown');

        this.batteryService = this.accessory.getService(this.platform.api.hap.Service.Battery)
            || this.accessory.addService(this.platform.api.hap.Service.Battery, 'Battery');

        this.airQualityService = this.accessory.getService(this.platform.api.hap.Service.AirQualitySensor)
            || this.accessory.addService(this.platform.api.hap.Service.AirQualitySensor, 'Air Quality');

        if (this.airthingsDevice.sensors.co2 && !this.deviceConfig.co2AirQualityDisabled) {
            this.airQualityService.getCharacteristic(this.platform.api.hap.Characteristic.CarbonDioxideLevel).setProps({});
        }

        if (this.airthingsDevice.sensors.humidity && !this.deviceConfig.humidityAirQualityDisabled) {
            this.airQualityService.getCharacteristic(this.platform.api.hap.Characteristic.CurrentRelativeHumidity).setProps({});
        }

        if (this.airthingsDevice.sensors.pm25 && !this.deviceConfig.pm25AirQualityDisabled) {
            this.airQualityService.getCharacteristic(this.platform.api.hap.Characteristic.PM2_5Density).setProps({
                unit: 'µg/m³'
            });
        }

        if (this.airthingsDevice.sensors.radonShortTermAvg && !this.deviceConfig.radonAirQualityDisabled) {
            this.airQualityService.addCharacteristic(new this.platform.api.hap.Characteristic('Radon', 'B42E01AA-ADE7-11E4-89D3-123B93F75CBA', {
                format: this.platform.api.hap.Formats.UINT16,
                perms: [this.platform.api.hap.Perms.NOTIFY, this.platform.api.hap.Perms.PAIRED_READ],
                unit: 'Bq/m³',
                minValue: 0,
                maxValue: 65535,
                minStep: 1
            }));
        }

        if (this.airthingsDevice.sensors.voc && !this.deviceConfig.vocAirQualityDisabled) {
            this.airQualityService.getCharacteristic(this.platform.api.hap.Characteristic.VOCDensity).setProps({
                unit: 'µg/m³',
                maxValue: 65535
            });

            this.airQualityService.addCharacteristic(new this.platform.api.hap.Characteristic('VOC Density (ppb)', 'E5B6DA60-E041-472A-BE2B-8318B8A724C5', {
                format: this.platform.api.hap.Formats.UINT16,
                perms: [this.platform.api.hap.Perms.NOTIFY, this.platform.api.hap.Perms.PAIRED_READ],
                unit: 'ppb',
                minValue: 0,
                maxValue: 65535,
                minStep: 1
            }));
        }

        if (this.airthingsDevice.sensors.temp) {
            this.temperatureService = this.accessory.getService(this.platform.api.hap.Service.TemperatureSensor)
                || this.accessory.addService(this.platform.api.hap.Service.TemperatureSensor, 'Temp');
        }
        else {
            this.temperatureService = new this.platform.api.hap.Service.TemperatureSensor('Temp');
        }

        if (this.airthingsDevice.sensors.humidity) {
            this.humidityService = this.accessory.getService(this.platform.api.hap.Service.HumiditySensor)
                || this.accessory.addService(this.platform.api.hap.Service.HumiditySensor, 'Humidity');
        }
        else {
            this.humidityService = new this.platform.api.hap.Service.HumiditySensor('Humidity');
        }

        if (this.airthingsDevice.sensors.co2) {
            this.carbonDioxideService = this.accessory.getService(this.platform.api.hap.Service.CarbonDioxideSensor)
                || this.accessory.addService(this.platform.api.hap.Service.CarbonDioxideSensor, 'CO2');
        }
        else {
            this.carbonDioxideService = new this.platform.api.hap.Service.CarbonDioxideSensor('CO2');
        }

        if (this.airthingsDevice.sensors.pressure) {
            this.airPressureService = this.accessory.getService('Air Pressure')
                || this.accessory.addService(new this.platform.api.hap.Service('Air Pressure', 'e863f00a-079e-48ff-8f27-9c2605a29f52', 'Air Pressure'));

            if (!this.airPressureService.testCharacteristic('Air Pressure')) {
                this.airPressureService.addCharacteristic(new this.platform.api.hap.Characteristic('Air Pressure', 'e863f10f-079e-48ff-8f27-9c2605a29f52', {
                    format: this.platform.api.hap.Formats.UINT16,
                    perms: [this.platform.api.hap.Perms.NOTIFY, this.platform.api.hap.Perms.PAIRED_READ],
                    unit: 'mBar',
                    minValue: 0,
                    maxValue: 1200,
                    minStep: 1
                }));
            }

            if (!this.airPressureService.testCharacteristic(this.platform.api.hap.Characteristic.StatusActive.UUID)) {
                this.airPressureService.addCharacteristic(this.platform.api.hap.Characteristic.StatusActive);
            }
        }
        else {
            this.airPressureService = new this.platform.api.hap.Service('Air Pressure', 'e863f00a-079e-48ff-8f27-9c2605a29f52');

            this.airPressureService.addCharacteristic(new this.platform.api.hap.Characteristic('Air Pressure', 'e863f10f-079e-48ff-8f27-9c2605a29f52', {
                format: this.platform.api.hap.Formats.UINT16,
                perms: [this.platform.api.hap.Perms.NOTIFY, this.platform.api.hap.Perms.PAIRED_READ],
                unit: 'mBar',
                minValue: 0,
                maxValue: 1200,
                minStep: 1
            }));

            this.airPressureService.addCharacteristic(this.platform.api.hap.Characteristic.StatusActive);
        }

        if (this.airthingsDevice.sensors.radonShortTermAvg && this.deviceConfig.radonLeakThreshold) {
            this.radonService = this.accessory.getService(this.platform.api.hap.Service.LeakSensor)
                || this.accessory.addService(this.platform.api.hap.Service.LeakSensor, 'Radon');
        }
        else {
            this.radonService = new this.platform.api.hap.Service.LeakSensor('Radon');
        }

        this.refreshCharacteristics();

        setInterval(async () => {
            await this.refreshCharacteristics();
        }, (this.platform.config.refreshInterval || 150) * 1000);
    }

    async getLatestSensorResult() {
        try {
            const sensorResults = await this.airthingsClient.getSensors(SensorUnits.Metric, [this.deviceConfig.serialNumber]);

            if (sensorResults.results.length === 0) {
                this.log.error(`${this.logPrefix} No sensor results found!`);
                return;
            }

            this.lastSensorResult = sensorResults.results[0];

            if (this.platform.config.debug) {
                this.log.info(`${this.logPrefix} ${JSON.stringify(this.lastSensorResult)}`);
            }
        }
        catch (err) {
            if (err instanceof Error) {
                this.log.error(`${this.logPrefix} ${err.message}`);
            }
        }
    }

    async refreshCharacteristics() {
        await this.getLatestSensorResult();

        const co2Sensor = this.lastSensorResult.sensors.find((x: AirthingsSensor) => x.sensorType === 'co2');
        const humiditySensor = this.lastSensorResult.sensors.find((x: AirthingsSensor) => x.sensorType === 'humidity');
        const pm25Sensor = this.lastSensorResult.sensors.find((x: AirthingsSensor) => x.sensorType === 'pm25');
        const pressureSensor = this.lastSensorResult.sensors.find((x: AirthingsSensor) => x.sensorType === 'pressure');
        const radonShortTermAvgSensor = this.lastSensorResult.sensors.find((x: AirthingsSensor) => x.sensorType === 'radonShortTermAvg');
        const tempSensor = this.lastSensorResult.sensors.find((x: AirthingsSensor) => x.sensorType === 'temp');
        const vocSensor = this.lastSensorResult.sensors.find((x: AirthingsSensor) => x.sensorType === 'voc');

        const lastSensorResultRecordedAt = this.lastSensorResult.recorded ? Math.floor(new Date(this.lastSensorResult.recorded).getTime()) : undefined;

        if (this.lastSensorResult.batteryPercentage) {
            this.batteryService.updateCharacteristic(this.platform.api.hap.Characteristic.BatteryLevel, this.lastSensorResult.batteryPercentage);
            this.batteryService.updateCharacteristic(
                this.platform.api.hap.Characteristic.StatusLowBattery,
                this.lastSensorResult.batteryPercentage > 10
                    ? this.platform.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
                    : this.platform.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
            );
        }

        this.airQualityService.updateCharacteristic(
            this.platform.api.hap.Characteristic.AirQuality,
            this.getAirQuality(this.lastSensorResult)
        );

        if (co2Sensor && !this.deviceConfig.co2AirQualityDisabled) {
            this.airQualityService.updateCharacteristic(this.platform.api.hap.Characteristic.CarbonDioxideLevel, co2Sensor.value);
        }

        if (humiditySensor && !this.deviceConfig.humidityAirQualityDisabled) {
            this.airQualityService.updateCharacteristic(this.platform.api.hap.Characteristic.CurrentRelativeHumidity, humiditySensor.value);
        }

        if (pm25Sensor && !this.deviceConfig.pm25AirQualityDisabled) {
            this.airQualityService.updateCharacteristic(this.platform.api.hap.Characteristic.PM2_5Density, pm25Sensor.value);
        }

        if (radonShortTermAvgSensor && !this.deviceConfig.radonAirQualityDisabled) {
            this.airQualityService.getCharacteristic('Radon')?.updateValue(radonShortTermAvgSensor.value);
        }

        if (vocSensor && !this.deviceConfig.vocAirQualityDisabled) {
            this.airQualityService.updateCharacteristic(
                this.platform.api.hap.Characteristic.VOCDensity,
                vocSensor.value * 2.2727
            );
            this.airQualityService.getCharacteristic('VOC Density (ppb)')?.updateValue(vocSensor.value);
        }

        this.airQualityService.updateCharacteristic(
            this.platform.api.hap.Characteristic.StatusActive,
            lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
        );

        if (tempSensor) {
            this.temperatureService.updateCharacteristic(this.platform.api.hap.Characteristic.CurrentTemperature, tempSensor.value);
            this.temperatureService.updateCharacteristic(this.platform.api.hap.Characteristic.StatusActive, true);
        }
        else {
            this.temperatureService.updateCharacteristic(
                this.platform.api.hap.Characteristic.StatusActive,
                lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
            );
        }

        if (humiditySensor) {
            this.humidityService.updateCharacteristic(this.platform.api.hap.Characteristic.CurrentRelativeHumidity, humiditySensor.value);
            this.humidityService.updateCharacteristic(this.platform.api.hap.Characteristic.StatusActive, true);
        }
        else {
            this.humidityService.updateCharacteristic(
                this.platform.api.hap.Characteristic.StatusActive,
                lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
            );
        }

        if (co2Sensor && this.deviceConfig.co2DetectedThreshold) {
            this.carbonDioxideService.updateCharacteristic(
                this.platform.api.hap.Characteristic.CarbonDioxideDetected,
                co2Sensor.value < this.deviceConfig.co2DetectedThreshold
                    ? this.platform.api.hap.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL
                    : this.platform.api.hap.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL
            );
            this.carbonDioxideService.updateCharacteristic(this.platform.api.hap.Characteristic.CarbonDioxideLevel, co2Sensor.value);
            this.carbonDioxideService.updateCharacteristic(this.platform.api.hap.Characteristic.StatusActive, true);
        }
        else {
            this.carbonDioxideService.updateCharacteristic(
                this.platform.api.hap.Characteristic.StatusActive,
                lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
            );
        }

        if (pressureSensor) {
            this.airPressureService.getCharacteristic('Air Pressure')?.updateValue(pressureSensor.value);
            this.airPressureService.updateCharacteristic(this.platform.api.hap.Characteristic.StatusActive, true);
        }
        else {
            this.airPressureService.updateCharacteristic(
                this.platform.api.hap.Characteristic.StatusActive,
                lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
            );
        }

        if (radonShortTermAvgSensor && this.deviceConfig.radonLeakThreshold) {
            this.radonService.updateCharacteristic(
                this.platform.api.hap.Characteristic.LeakDetected,
                radonShortTermAvgSensor.value < this.deviceConfig.radonLeakThreshold
                    ? this.platform.api.hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED
                    : this.platform.api.hap.Characteristic.LeakDetected.LEAK_DETECTED
            );
            this.radonService.updateCharacteristic(this.platform.api.hap.Characteristic.StatusActive, true);
        }
        else {
            this.radonService.updateCharacteristic(
                this.platform.api.hap.Characteristic.StatusActive,
                lastSensorResultRecordedAt != undefined && Date.now() - lastSensorResultRecordedAt < 2 * 60 * 60 * 1000
            );
        }
    }

    getAirQuality(lastResult: SensorResult): CharacteristicValue {
        let aq = this.platform.api.hap.Characteristic.AirQuality.UNKNOWN;

        const co2Sensor = lastResult.sensors.find((x: AirthingsSensor) => x.sensorType === 'co2');
        if (co2Sensor && !this.deviceConfig.co2AirQualityDisabled) {
            if (co2Sensor.value >= 1000) {
                aq = Math.max(aq, this.platform.api.hap.Characteristic.AirQuality.POOR);
            }
            else if (co2Sensor.value >= 800) {
                aq = Math.max(aq, this.platform.api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, this.platform.api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        const humiditySensor = lastResult.sensors.find((x: AirthingsSensor) => x.sensorType === 'humidity');
        if (humiditySensor && !this.deviceConfig.humidityAirQualityDisabled) {
            if (humiditySensor.value < 25 || humiditySensor.value >= 70) {
                aq = Math.max(aq, this.platform.api.hap.Characteristic.AirQuality.POOR);
            }
            else if (humiditySensor.value < 30 || humiditySensor.value >= 60) {
                aq = Math.max(aq, this.platform.api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, this.platform.api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        const pm25Sensor = lastResult.sensors.find((x: AirthingsSensor) => x.sensorType === 'pm25');
        if (pm25Sensor && !this.deviceConfig.pm25AirQualityDisabled) {
            if (pm25Sensor.value >= 25) {
                aq = Math.max(aq, this.platform.api.hap.Characteristic.AirQuality.POOR);
            }
            else if (pm25Sensor.value >= 10) {
                aq = Math.max(aq, this.platform.api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, this.platform.api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        const radonShortTermAvgSensor = lastResult.sensors.find((x: AirthingsSensor) => x.sensorType === 'radonShortTermAvg');
        if (radonShortTermAvgSensor && !this.deviceConfig.radonAirQualityDisabled) {
            if (radonShortTermAvgSensor.value >= 150) {
                aq = Math.max(aq, this.platform.api.hap.Characteristic.AirQuality.POOR);
            }
            else if (radonShortTermAvgSensor.value >= 100) {
                aq = Math.max(aq, this.platform.api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, this.platform.api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        const vocSensor = lastResult.sensors.find((x: AirthingsSensor) => x.sensorType === 'voc');
        if (vocSensor && !this.deviceConfig.vocAirQualityDisabled) {
            if (vocSensor.value >= 2000) {
                aq = Math.max(aq, this.platform.api.hap.Characteristic.AirQuality.POOR);
            }
            else if (vocSensor.value >= 250) {
                aq = Math.max(aq, this.platform.api.hap.Characteristic.AirQuality.FAIR);
            }
            else {
                aq = Math.max(aq, this.platform.api.hap.Characteristic.AirQuality.GOOD);
            }
        }

        return aq;
    }
}
