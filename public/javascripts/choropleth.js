/**
 * Initialize variables
 */
var layer = 'contour',
    metric = 'total',
    numBreaks = 100, // How many layers of opacity values there should be
    topValue = parseInt(templateOutput_topValue), // This should be the highest "total" value in the data
    filteruse,
    breaks = [],
    opacities = [],
    names = [];

/**
 * Logarithmic scale
 */
function logScale(currentBreak, numBreaks, topValue) {
    // current break will be between 0 and numBreaks
    var minp = 0;
    var maxp = numBreaks;

    // The result should be between 1 an topValue
    var minv = Math.log(1);
    var maxv = Math.log(topValue);

    // calculate adjustment factor
    var scale = (maxv - minv) / (maxp - minp);

    return Math.exp(minv + scale * (currentBreak - minp));
}

/**
 * Generate layer breakpoints, layer names, and opacity values;
 */
for (i = 0; i < numBreaks; i++) {
    breaks[i] = logScale(i, numBreaks, topValue);
    opacities[i] = (i / numBreaks);
    names[i] = 'layer-' + i;
}

/**
 * Mapbox access token
 */
mapboxgl.accessToken = 'pk.eyJ1Ijoic2NoZW1hIiwiYSI6IjAxcE9MMlkifQ.Kljao5iyXhySu2qYbtw-_A';

/**
 * Create map, set style and centering
 */
var map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/schema/cinavisv200i4bckv2fb6atgp',
    center: [0, 35],
    zoom: 1.5 // starting zoom
});

/**
 * On load map
 */
map.on('load', function () {

    /**
     * Add source data to map
     */
    map.addSource('countries', {
        type: 'geojson',
        data: geoData
    });

    /**
     * Loop through layers, filter countries, and apply opacity
     */
    for (i = 0; i < numBreaks; i++) {
        if (i < numBreaks - 1) {
            filteruse = ['all', ['>=', metric, breaks[i]], ['<', metric, breaks[i + 1]]];
        } else {
            filteruse = ['>=', metric, breaks[i]];
        }

        map.addLayer({
            id: names[i],
            type: 'fill',
            source: 'countries',
            'source-layer': layer,
            filter: filteruse,
            paint: {
                'fill-color': '#00DAE5',
                'fill-opacity': opacities[i]
            }
        }, 'water');
    }

    /**
     * Create a popup, but don't add it to the map yet
     */
    var popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false
    });

    /**
     * Show popup on country hover
     */
    map.on('mousemove', function (e) {
        var features = map.queryRenderedFeatures(e.point, {layers: names});

        // Change cursor style
        map.getCanvas().style.cursor = (features.length) ? 'pointer' : '';

        if (!features.length) {
            popup.remove();
            return;
        }

        var feature = features[0];

        /**
         * Populate the popup and set its coordinates based on the feature found
         */
        popup.setLngLat(e.lngLat)
            .setHTML('<span class="popup-key">' + feature.properties.name + '</span> <span class="popup-value">' + feature.properties.total + '</span>')
            .addTo(map);
    });

    /**
     * Filter by country on click
     */
    map.on('click', function (e) {
        var features = map.queryRenderedFeatures(e.point, {layers: names});

        var feature = features[0];

        var queryParamJoinChar = routePath_withoutFilter.indexOf('?') !== -1 ? '&' : '?';

        var filterObjForThisFilterColVal = constructedFilterObj(filterObj, mapBy, feature.properties.name, false);
        var filterObjString = $.param(filterObjForThisFilterColVal);
        var urlForFilterValue = routePath_withoutFilter + queryParamJoinChar + filterObjString;

        window.location = urlForFilterValue;
    });
});