import { SensorResult } from 'airthings-consumer-api';
import { Formats, PlatformAccessory, Perms, Service } from 'homebridge';

import { AirthingsDeviceConfig } from './config.js';
import { AirthingsDeviceInfo, getAirthingsDeviceInfoBySerialNumber } from './device.js';
import { AirthingsPlatform } from './platform.js';

/**
 * Custom characteristic UUIDs (same as old plugin for compatibility)
 */
const RADON_CHARACTERISTIC_UUID = 'B42E01AA-ADE7-11E4-89D3-123B93F75CBA';
const VOC_PPB_CHARACTERISTIC_UUID = 'E5B6DA60-E041-472A-BE2B-8318B8A724C5';
const AIR_PRESSURE_SERVICE_UUID = 'e863f00a-079e-48ff-8f27-9c2605a29f52';
const AIR_PRESSURE_CHARACTERISTIC_UUID = 'e863f10f-079e-48ff-8f27-9c2605a29f52';

/**
 * AirthingsAccessory
 * Accessory handler for a single Airthings device
 */
export class AirthingsAccessory {
    public readonly deviceInfo: AirthingsDeviceInfo;

    // Services
    private readonly batteryService?: Service;
    private readonly airQualityService: Service;
    private readonly temperatureService?: Service;
    private readonly humidityService?: Service;
    private readonly carbonDioxideService?: Service;
    private readonly airPressureService?: Service;
    private readonly radonService?: Service;

    constructor(
        public readonly platform: AirthingsPlatform,
        public readonly accessory: PlatformAccessory,
        public readonly config: AirthingsDeviceConfig
    ) {
        // Get device info from serial number (Requirement 4.2)
        this.deviceInfo = getAirthingsDeviceInfoBySerialNumber(config.serialNumber ?? '');

        this.platform.log.debug(`Initializing accessory handler for ${config.serialNumber} (${this.deviceInfo.model})`);

        // Configure AccessoryInformation service
        this.configureInformationService();

        // Configure Air Quality service with sensor characteristics
        this.airQualityService = this.configureAirQualityService();

        // Configure optional services based on device sensors
        if (this.deviceInfo.sensors.temp) {
            this.temperatureService = this.configureTemperatureService();
        }

        if (this.deviceInfo.sensors.humidity) {
            this.humidityService = this.configureHumidityService();
        }

        if (this.deviceInfo.sensors.co2) {
            this.carbonDioxideService = this.configureCarbonDioxideService();
        }

        if (this.deviceInfo.sensors.pressure) {
            this.airPressureService = this.configureAirPressureService();
        }

        // Configure Battery service (if not disabled)
        if (!this.config.batteryDisabled) {
            this.batteryService = this.configureBatteryService();
        }

        // Configure Radon Leak service (if threshold set and device supports radon)
        if (this.deviceInfo.sensors.radonShortTermAvg && this.config.radonLeakThreshold != null) {
            this.radonService = this.configureRadonLeakService();
        }
    }

    /**
     * Configure AccessoryInformation service
     */
    private configureInformationService(): void {
        const service = this.accessory.getService(this.platform.Service.AccessoryInformation)
            ?? this.accessory.addService(this.platform.Service.AccessoryInformation);

        service
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Airthings')
            .setCharacteristic(this.platform.Characteristic.Model, this.deviceInfo.model)
            .setCharacteristic(this.platform.Characteristic.Name, this.config.name ?? `Airthings ${this.config.serialNumber}`)
            .setCharacteristic(this.platform.Characteristic.SerialNumber, this.config.serialNumber ?? 'Unknown')
            .setCharacteristic(this.platform.Characteristic.FirmwareRevision, 'Unknown');
    }

    /**
     * Configure Air Quality service with sensor characteristics
     */
    private configureAirQualityService(): Service {
        const service = this.accessory.getService(this.platform.Service.AirQualitySensor)
            ?? this.accessory.addService(this.platform.Service.AirQualitySensor, 'Air Quality');

        // Add CO2 characteristic if device supports it and not disabled
        if (this.deviceInfo.sensors.co2 && !this.config.co2AirQualityDisabled) {
            service.getCharacteristic(this.platform.Characteristic.CarbonDioxideLevel).setProps({});
        }

        // Add Humidity characteristic if device supports it and not disabled
        if (this.deviceInfo.sensors.humidity && !this.config.humidityAirQualityDisabled) {
            service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity).setProps({});
        }

        // Add PM2.5 characteristic if device supports it and not disabled
        if (this.deviceInfo.sensors.pm25 && !this.config.pm25AirQualityDisabled) {
            service.getCharacteristic(this.platform.Characteristic.PM2_5Density).setProps({
                unit: 'µg/m³'
            });
        }

        // Add custom Radon characteristic if device supports it and not disabled
        if (this.deviceInfo.sensors.radonShortTermAvg && !this.config.radonAirQualityDisabled) {
            if (!service.getCharacteristic('Radon')) {
                service.addCharacteristic(new this.platform.api.hap.Characteristic('Radon', RADON_CHARACTERISTIC_UUID, {
                    format: Formats.UINT16,
                    perms: [Perms.NOTIFY, Perms.PAIRED_READ],
                    unit: 'Bq/m³',
                    minValue: 0,
                    maxValue: 65535,
                    minStep: 1
                }));
            }
        }

        // Add VOC characteristics if device supports it and not disabled
        if (this.deviceInfo.sensors.voc && !this.config.vocAirQualityDisabled) {
            service.getCharacteristic(this.platform.Characteristic.VOCDensity).setProps({
                unit: 'µg/m³',
                maxValue: 65535
            });

            if (!service.getCharacteristic('VOC Density (ppb)')) {
                service.addCharacteristic(new this.platform.api.hap.Characteristic('VOC Density (ppb)', VOC_PPB_CHARACTERISTIC_UUID, {
                    format: Formats.UINT16,
                    perms: [Perms.NOTIFY, Perms.PAIRED_READ],
                    unit: 'ppb',
                    minValue: 0,
                    maxValue: 65535,
                    minStep: 1
                }));
            }
        }

        return service;
    }

    /**
     * Configure Temperature service
     */
    private configureTemperatureService(): Service {
        const service = this.accessory.getService(this.platform.Service.TemperatureSensor)
            ?? this.accessory.addService(this.platform.Service.TemperatureSensor, 'Temp');

        return service;
    }

    /**
     * Configure Humidity service
     */
    private configureHumidityService(): Service {
        const service = this.accessory.getService(this.platform.Service.HumiditySensor)
            ?? this.accessory.addService(this.platform.Service.HumiditySensor, 'Humidity');

        return service;
    }

    /**
     * Configure Carbon Dioxide service
     */
    private configureCarbonDioxideService(): Service {
        const service = this.accessory.getService(this.platform.Service.CarbonDioxideSensor)
            ?? this.accessory.addService(this.platform.Service.CarbonDioxideSensor, 'CO2');

        return service;
    }

    /**
     * Configure Air Pressure service (Eve-compatible)
     */
    private configureAirPressureService(): Service {
        // First try to get existing service by UUID with subtype
        let service = this.accessory.getServiceById(AIR_PRESSURE_SERVICE_UUID, 'air-pressure');

        // Also check for service without subtype (from cached accessories)
        if (!service) {
            const existingServices = this.accessory.services.filter(
                s => s.UUID === AIR_PRESSURE_SERVICE_UUID
            );
            if (existingServices.length > 0) {
                service = existingServices[0];
            }
        }

        if (!service) {
            const airPressureService = new this.platform.api.hap.Service('Air Pressure', AIR_PRESSURE_SERVICE_UUID, 'air-pressure');

            airPressureService.addCharacteristic(new this.platform.api.hap.Characteristic('Air Pressure', AIR_PRESSURE_CHARACTERISTIC_UUID, {
                format: Formats.UINT16,
                perms: [Perms.NOTIFY, Perms.PAIRED_READ],
                unit: 'mBar',
                minValue: 0,
                maxValue: 1200,
                minStep: 1
            }));

            airPressureService.addCharacteristic(this.platform.Characteristic.StatusActive);

            service = this.accessory.addService(airPressureService);
        }

        return service;
    }

    /**
     * Configure Battery service
     */
    private configureBatteryService(): Service {
        const service = this.accessory.getService(this.platform.Service.Battery)
            ?? this.accessory.addService(this.platform.Service.Battery, 'Battery');

        return service;
    }

    /**
     * Configure Radon Leak service
     */
    private configureRadonLeakService(): Service {
        const service = this.accessory.getService(this.platform.Service.LeakSensor)
            ?? this.accessory.addService(this.platform.Service.LeakSensor, 'Radon');

        return service;
    }

    /**
     * Update all service characteristics from SensorResult
     * Handles missing sensor values gracefully
     * Sets StatusActive based on data freshness
     */
    updateCharacteristics(sensorResult: SensorResult): void {
        const co2Sensor = sensorResult.sensors.find(x => x.sensorType === 'co2');
        const humiditySensor = sensorResult.sensors.find(x => x.sensorType === 'humidity');
        const pm25Sensor = sensorResult.sensors.find(x => x.sensorType === 'pm25');
        const pressureSensor = sensorResult.sensors.find(x => x.sensorType === 'pressure');
        const radonShortTermAvgSensor = sensorResult.sensors.find(x => x.sensorType === 'radonShortTermAvg');
        const tempSensor = sensorResult.sensors.find(x => x.sensorType === 'temp');
        const vocSensor = sensorResult.sensors.find(x => x.sensorType === 'voc');

        // Calculate data freshness (active if recorded within last 2 hours)
        const lastRecordedAt = sensorResult.recorded ? Math.floor(new Date(sensorResult.recorded).getTime()) : undefined;
        const isDataFresh = lastRecordedAt != null && Date.now() - lastRecordedAt < 2 * 60 * 60 * 1000;

        // Update Battery Service
        if (this.batteryService && sensorResult.batteryPercentage != null) {
            this.batteryService.getCharacteristic(this.platform.Characteristic.BatteryLevel)
                .updateValue(sensorResult.batteryPercentage);
            this.batteryService.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
                .updateValue(
                    sensorResult.batteryPercentage > 10
                        ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
                        : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
                );
        }

        // Update Air Quality Service
        this.airQualityService.getCharacteristic(this.platform.Characteristic.AirQuality)
            .updateValue(this.getAirQuality(sensorResult));

        if (co2Sensor && !this.config.co2AirQualityDisabled) {
            this.airQualityService.getCharacteristic(this.platform.Characteristic.CarbonDioxideLevel)
                .updateValue(co2Sensor.value);
        }

        if (humiditySensor && !this.config.humidityAirQualityDisabled) {
            this.airQualityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
                .updateValue(humiditySensor.value);
        }

        if (pm25Sensor && !this.config.pm25AirQualityDisabled) {
            this.airQualityService.getCharacteristic(this.platform.Characteristic.PM2_5Density)
                .updateValue(pm25Sensor.value);
        }

        if (radonShortTermAvgSensor && !this.config.radonAirQualityDisabled) {
            this.airQualityService.getCharacteristic('Radon')?.updateValue(radonShortTermAvgSensor.value);
        }

        if (vocSensor && !this.config.vocAirQualityDisabled) {
            // Convert ppb to µg/m³ (factor of ~2.2727 for typical VOC)
            this.airQualityService.getCharacteristic(this.platform.Characteristic.VOCDensity)
                ?.updateValue(vocSensor.value * 2.2727);
            this.airQualityService.getCharacteristic('VOC Density (ppb)')?.updateValue(vocSensor.value);
        }

        this.airQualityService.getCharacteristic(this.platform.Characteristic.StatusActive)
            .updateValue(isDataFresh);

        // Update Temperature Service
        if (this.temperatureService) {
            if (tempSensor) {
                this.temperatureService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
                    .updateValue(tempSensor.value);
                this.temperatureService.getCharacteristic(this.platform.Characteristic.StatusActive)
                    .updateValue(true);
            }
            else {
                this.temperatureService.getCharacteristic(this.platform.Characteristic.StatusActive)
                    .updateValue(isDataFresh);
            }
        }

        // Update Humidity Service
        if (this.humidityService) {
            if (humiditySensor) {
                this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
                    .updateValue(humiditySensor.value);
                this.humidityService.getCharacteristic(this.platform.Characteristic.StatusActive)
                    .updateValue(true);
            }
            else {
                this.humidityService.getCharacteristic(this.platform.Characteristic.StatusActive)
                    .updateValue(isDataFresh);
            }
        }

        // Update Carbon Dioxide Service
        if (this.carbonDioxideService) {
            const co2DetectedThreshold = this.config.co2DetectedThreshold ?? 1000;
            if (co2Sensor) {
                this.carbonDioxideService.getCharacteristic(this.platform.Characteristic.CarbonDioxideDetected)
                    .updateValue(
                        co2Sensor.value < co2DetectedThreshold
                            ? this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL
                            : this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL
                    );
                this.carbonDioxideService.getCharacteristic(this.platform.Characteristic.CarbonDioxideLevel)
                    .updateValue(co2Sensor.value);
                this.carbonDioxideService.getCharacteristic(this.platform.Characteristic.StatusActive)
                    .updateValue(true);
            }
            else {
                this.carbonDioxideService.getCharacteristic(this.platform.Characteristic.StatusActive)
                    .updateValue(isDataFresh);
            }
        }

        // Update Air Pressure Service
        if (this.airPressureService) {
            if (pressureSensor) {
                this.airPressureService.getCharacteristic('Air Pressure')?.updateValue(pressureSensor.value);
                this.airPressureService.getCharacteristic(this.platform.Characteristic.StatusActive)
                    .updateValue(true);
            }
            else {
                this.airPressureService.getCharacteristic(this.platform.Characteristic.StatusActive)
                    .updateValue(isDataFresh);
            }
        }

        // Update Radon Leak Service
        if (this.radonService && this.config.radonLeakThreshold != null) {
            if (radonShortTermAvgSensor) {
                this.radonService.getCharacteristic(this.platform.Characteristic.LeakDetected)
                    .updateValue(
                        radonShortTermAvgSensor.value < this.config.radonLeakThreshold
                            ? this.platform.Characteristic.LeakDetected.LEAK_NOT_DETECTED
                            : this.platform.Characteristic.LeakDetected.LEAK_DETECTED
                    );
                this.radonService.getCharacteristic(this.platform.Characteristic.StatusActive)
                    .updateValue(true);
            }
            else {
                this.radonService.getCharacteristic(this.platform.Characteristic.StatusActive)
                    .updateValue(isDataFresh);
            }
        }
    }

    /**
     * Set all services to inactive status (used when API errors occur)
     */
    setInactive(): void {
        this.airQualityService.getCharacteristic(this.platform.Characteristic.StatusActive)
            .updateValue(false);

        if (this.temperatureService) {
            this.temperatureService.getCharacteristic(this.platform.Characteristic.StatusActive)
                .updateValue(false);
        }

        if (this.humidityService) {
            this.humidityService.getCharacteristic(this.platform.Characteristic.StatusActive)
                .updateValue(false);
        }

        if (this.carbonDioxideService) {
            this.carbonDioxideService.getCharacteristic(this.platform.Characteristic.StatusActive)
                .updateValue(false);
        }

        if (this.airPressureService) {
            this.airPressureService.getCharacteristic(this.platform.Characteristic.StatusActive)
                .updateValue(false);
        }

        if (this.radonService) {
            this.radonService.getCharacteristic(this.platform.Characteristic.StatusActive)
                .updateValue(false);
        }
    }

    /**
     * Calculate air quality level based on sensor values and thresholds
     * Returns the worst air quality level across all enabled sensors
     *
     * Thresholds (from design document):
     * - CO2: Good (<800), Fair (800-999), Poor (≥1000)
     * - Humidity: Good (30-59%), Fair (25-29% or 60-69%), Poor (<25% or ≥70%)
     * - PM2.5: Good (<10), Fair (10-24), Poor (≥25)
     * - Radon: Good (<100), Fair (100-149), Poor (≥150)
     * - VOC: Good (<250), Fair (250-1999), Poor (≥2000)
     */
    getAirQuality(sensorResult: SensorResult): number {
        let aq = this.platform.Characteristic.AirQuality.UNKNOWN;

        // CO2 threshold logic
        const co2Sensor = sensorResult.sensors.find(x => x.sensorType === 'co2');
        if (co2Sensor && !this.config.co2AirQualityDisabled) {
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

        // Humidity threshold logic
        const humiditySensor = sensorResult.sensors.find(x => x.sensorType === 'humidity');
        if (humiditySensor && !this.config.humidityAirQualityDisabled) {
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

        // PM2.5 threshold logic
        const pm25Sensor = sensorResult.sensors.find(x => x.sensorType === 'pm25');
        if (pm25Sensor && !this.config.pm25AirQualityDisabled) {
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

        // Radon threshold logic
        const radonShortTermAvgSensor = sensorResult.sensors.find(x => x.sensorType === 'radonShortTermAvg');
        if (radonShortTermAvgSensor && !this.config.radonAirQualityDisabled) {
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

        // VOC threshold logic
        const vocSensor = sensorResult.sensors.find(x => x.sensorType === 'voc');
        if (vocSensor && !this.config.vocAirQualityDisabled) {
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
