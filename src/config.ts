import { PlatformConfig } from 'homebridge';

/**
 * Platform configuration interface
 */
export interface AirthingsPlatformConfig extends PlatformConfig {
    clientId?: string;
    clientSecret?: string;
    refreshInterval?: number;
    debug?: boolean;
    devices?: AirthingsDeviceConfig[];
}

/**
 * Per-device configuration interface
 */
export interface AirthingsDeviceConfig {
    serialNumber?: string;
    name?: string;
    batteryDisabled?: boolean;
    co2AirQualityDisabled?: boolean;
    humidityAirQualityDisabled?: boolean;
    pm25AirQualityDisabled?: boolean;
    radonAirQualityDisabled?: boolean;
    vocAirQualityDisabled?: boolean;
    co2DetectedThreshold?: number;
    radonLeakThreshold?: number;
}
