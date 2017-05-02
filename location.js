var request = require('request-promise');
var findInArray = require('./helper.js').findInArray;

var countryCodes = [
        "AL",
        "AD",
        "AU",
        "BD",
        "BE",
        "BT",
        "BO",
        "BR",
        "BG",
        "KH",
        "CA",
        "CL",
        "CO",
        "HR",
        "CZ",
        "DK",
        "EC",
        "EE",
        "FI",
        "FR",
        "DE",
        "GH",
        "GR",
        "HU",
        "IS",
        "ID",
        "IE",
        "IL",
        "IT",
        "JP",
        "KG",
        "LV",
        "LS",
        "LT",
        "LU",
        "MK",
        "MY",
        "MX",
        "MN",
        "ME",
        "NL",
        "NZ",
        "PE",
        "PH",
        "PL",
        "PT",
        "PR",
        "RO",
        "SN",
        "RS",
        "SG",
        "SK",
        "SI",
        "ZA",
        "KR",
        "ES",
        "LK",
        "SZ",
        "SE",
        "CH",
        "TW",
        "TH",
        "TN",
        "TR",
        "UG",
        "UA",
        "GB",
        "US",
        "UY"
];

var getCountryFeature = (boxes, countryCode) => {
    let features = boxes.features;
    for (let i = 0; i < features.length; i++) {
        if (features[i].properties.iso3166 === countryCode) {
            return features[i];
        }
    }
};

var getBounds = (boxes, countryCode) => {
    let feature = getCountryFeature(boxes, countryCode);
    if (feature != undefined) {
        let southWestCorner = feature.geometry.coordinates[0][0];
        let northEastCorner = feature.geometry.coordinates[0][2];
        return {
            maxLat: northEastCorner[1],
            minLat: southWestCorner[1],
            maxLng: northEastCorner[0],
            minLng: southWestCorner[0],
            countryCode: countryCode
        };
    } else {
        console.log('No feature found.')
    }
};

var getRandomLatLng = (bounds) => {
    return {
        lat: bounds.minLat + Math.random() * (bounds.maxLat - bounds.minLat),
        lng: bounds.minLng + Math.random() * (bounds.maxLng - bounds.minLng)
    };
};

var getRadius = (bounds) => {
    let calculateDistance = (lat1, lon1, lat2, lon2) => {
        let radlat1 = Math.PI * lat1 / 180;
        let radlat2 = Math.PI * lat2 / 180;
        let theta = lon1 - lon2;
        let radtheta = Math.PI * theta / 180;
        let dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
        dist = Math.acos(dist);
        dist = dist * 180 / Math.PI;
        dist = dist * 60 * 1.1515 * 1.609344;
        return dist;
    };

    let distanceAcrossBounds = calculateDistance(bounds.minLat, bounds.minLng, bounds.maxLat, bounds.maxLng);

    if (distanceAcrossBounds > 5000) 
        return 25000;
    else if (distanceAcrossBounds > 1000) //km
        return 10000; //m
    else if (distanceAcrossBounds > 25) 
        return 1000;
    else 
        return 100;
};

var getRequestOptions = (latLng, radius) => {
    let url = 'http://maps.google.com/cbk?output=json&hl=en&ll=' + latLng.lat + ',' + latLng.lng + '&radius=' + radius + '&cb_client=maps_sv&v=4';
    return {
        url: url,
        json: true
    };
};

async function makeRequest(options) {
    let json = await request.get(options);
    return json;
}

var extractLocation = (json) => {
    return {
        lat: json.Location.lat,
        lng: json.Location.lng
    };
};

var getRandomCountryCode = () => {
    let codeIndex = Math.floor(Math.random() * countryCodes.length);
    return countryCodes[codeIndex];
}

var getCountryCode = (codes, countryName) => {
    let codeIndex = findInArray(codes, 'name', countryName);
    if (codeIndex != -1) {
        return codes[codeIndex]['alpha-2'];
    } else {
        console.log('Code not found.');
    }
}

async function getLocation(bounds, codes, chosenLatitudes) {
    let json = {};
    let locationWithinCountry = false;
    while (Object.keys(json).length == 0 || !locationWithinCountry) {
        let latLng = getRandomLatLng(bounds);
        let radius = getRadius(bounds);
        let requestOptions = getRequestOptions(latLng, radius);
        json = await makeRequest(requestOptions);
        if (Object.keys(json).length != 0) {
            if (bounds.countryCode != 'custom') {
                locationWithinCountry = (getCountryCode(codes, json.Location.country) == bounds.countryCode);
            } else {
                locationWithinCountry = true;
            }

            if (chosenLatitudes.indexOf(json.Location.lat) != -1) {
                json = {};
                continue;
            } else {
                chosenLatitudes.push(json.Location.lat);
            }
        }
    }
    return extractLocation(json);
}

module.exports = {
    getLocations: async function(clients, countriesInfo, gameSettings) {
        let boundsArray = [];

        if (gameSettings.countryCode == '') { //if no countryCode generate random ones
            for (let i = 0; i < gameSettings.numberOfLocations; i++) {
                let randomCode = getRandomCountryCode();
                let bounds = getBounds(countriesInfo.boxes, randomCode);
                boundsArray.push(bounds);
            }
        } else if (gameSettings.countryCode == 'custom') {
            //pull bounds from gameSettings
            //in that case getLocation does not have to check if found location is within given country
            let bounds = {
                minLat: gameSettings.minLat,
                maxLat: gameSettings.maxLat,
                minLng: gameSettings.minLng,
                maxLng: gameSettings.maxLng,
                countryCode: 'custom'
            }
            for (let i = 0; i < gameSettings.numberOfLocations; i++) {
                boundsArray.push(bounds);
            }
        } else {
            let bounds = getBounds(countriesInfo.boxes, gameSettings.countryCode);
            for (let i = 0; i < gameSettings.numberOfLocations; i++) {
                boundsArray.push(bounds);
            }
        }
        
        let chosenLatitudes = [];
        let promises = boundsArray.map((bounds) => getLocation(bounds, countriesInfo.codes, chosenLatitudes));
        let locations = await Promise.all(promises);

        if (clients.length == 1) {
            clients[0].emit('startSingleplayerGame', locations);
        } else {
            for (let i = 0; i < clients.length; i++) {
                clients[i].emit('startMultiplayerGame', {
                    locations: locations,
                    timerLimit: gameSettings.timerLimit,
                    hintsEnabled: gameSettings.hintsEnabled
                });
            }
        }
    }, 
    
    getCityLocations: (clients, cities, gameSettings) => {
        let numberOfLocations = gameSettings.numberOfLocations;
        let locations = [];
        let alreadySelectedCityIndexes = [];

        for (let i = 0; i < numberOfLocations; i++) {
            let cityIndex = Math.floor(Math.random() * cities.length);
            while (locations.indexOf(cityIndex) != -1) {
                cityIndex = Math.floor(Math.random() * cities.length);
            }

            let city = cities[cityIndex];
            alreadySelectedCityIndexes.push(cityIndex);
            locations.push({
                lat: city[0],
                lng: city[1]
            });
        }

        if (clients.length == 1) {
            clients[0].emit('startSingleplayerGame', locations);
        } else {
            for (let i = 0; i < clients.length; i++) {
                clients[i].emit('startMultiplayerGame', {
                    locations: locations,
                    timerLimit: gameSettings.timerLimit,
                    hintsEnabled: gameSettings.hintsEnabled
                });
            }
        }
    }
};