export function getAirthingsDeviceInfoBySerialNumber(serialNumber: string) {
    switch (serialNumber.substring(0, 4)) {
        case '2900':
            return {
                model: 'Wave',
                sensors: {
                    co2: false,
                    humidity: true,
                    mold: false,
                    pm1: false,
                    pm25: false,
                    pressure: false,
                    radonShortTermAvg: true,
                    temp: true,
                    voc: false
                }
            } as AirthingsDeviceInfo;
        case '2920':
            return {
                model: 'Wave Mini',
                sensors: {
                    co2: false,
                    humidity: true,
                    mold: true,
                    pm1: false,
                    pm25: false,
                    pressure: false,
                    radonShortTermAvg: false,
                    temp: true,
                    voc: true
                }
            } as AirthingsDeviceInfo;
        case '2930':
            return {
                model: 'Wave Plus',
                sensors: {
                    co2: true,
                    humidity: true,
                    mold: false,
                    pm1: false,
                    pm25: false,
                    pressure: true,
                    radonShortTermAvg: true,
                    temp: true,
                    voc: true
                }
            } as AirthingsDeviceInfo;
        case '2950':
            return {
                model: 'Wave Radon',
                sensors: {
                    co2: false,
                    humidity: true,
                    mold: false,
                    pm1: false,
                    pm25: false,
                    pressure: false,
                    radonShortTermAvg: true,
                    temp: true,
                    voc: false
                }
            } as AirthingsDeviceInfo;
        case '2960':
            return {
                model: 'View Plus',
                sensors: {
                    co2: true,
                    humidity: true,
                    mold: false,
                    pm1: true,
                    pm25: true,
                    pressure: true,
                    radonShortTermAvg: true,
                    temp: true,
                    voc: true
                }
            } as AirthingsDeviceInfo;
        case '2980':
            return {
                model: 'View Pollution',
                sensors: {
                    co2: false,
                    humidity: true,
                    mold: false,
                    pm1: true,
                    pm25: true,
                    pressure: false,
                    radonShortTermAvg: false,
                    temp: true,
                    voc: false
                }
            } as AirthingsDeviceInfo;
        case '2989':
            return {
                model: 'View Radon',
                sensors: {
                    co2: false,
                    humidity: true,
                    mold: false,
                    pm1: false,
                    pm25: false,
                    pressure: false,
                    radonShortTermAvg: true,
                    temp: true,
                    voc: false
                }
            } as AirthingsDeviceInfo;
        case '3220':
            return {
                model: "Wave Enhance",
                sensors: {
                    co2: true,
                    humidity: true,
                    mold: false,
                    pm1: false,
                    pm25: false,
                    pressure: true,
                    radonShortTermAvg: false,
                    temp: true,
                    voc: true
                }
            } as AirthingsDeviceInfo;
         default:
            return {
                model: 'Unknown',
                sensors: {
                    co2: false,
                    humidity: false,
                    mold: false,
                    pm1: false,
                    pm25: false,
                    pressure: false,
                    radonShortTermAvg: false,
                    temp: false,
                    voc: false
                }
            } as AirthingsDeviceInfo;
    }
}

export interface AirthingsDeviceInfo {
    model: string;
    sensors: {
        co2: boolean;
        humidity: boolean;
        mold: boolean;
        pm1: boolean;
        pm25: boolean;
        pressure: boolean;
        radonShortTermAvg: boolean;
        temp: boolean;
        voc: boolean;
    };
}
