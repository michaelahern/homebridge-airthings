import { API } from 'homebridge';

import { AirthingsPlatform } from './plugin.js';

const PLUGIN_NAME = 'homebridge-airthings';
const PLATFORM_NAME = 'Airthings';

export default (api: API) => {
    api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, AirthingsPlatform);
};
