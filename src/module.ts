import { API } from 'homebridge';

import { AirthingsPlatform } from './platform.js';
import { PLATFORM_NAME } from './settings.js';

export default (api: API) => {
    api.registerPlatform(PLATFORM_NAME, AirthingsPlatform);
};
