//
var winston = require('winston');
//
var import_datatypes = require('../utils/import_datatypes');
//
//
exports.Descriptions =
    [
        {
            filename: "VMS_Cumulative.csv",
            fileEncoding: "utf8", // the default
            uid: "vms_survey",
            importRevision: 2,
            format: import_datatypes.DataSource_formats.CSV,
            title: "Visitor Motivation Survey",
            brandColor: "#03A678",
            urls: [ "--" ],
            description: "This data describes the motivations behind five different categories of users who have visisted museum websites.  Currently, five different museums are represented in this data.",
            fe_listed: true,
            fe_displayTitleOverrides: {}, // this is needed to not through an error
            //
            //
            fn_new_rowPrimaryKeyFromRowObject: function (rowObject, rowIndex) {
                return "" + rowIndex + "-" + rowObject["id"]
            },
            raw_rowObjects_coercionScheme: {
                'Date': {
                    do: import_datatypes.Coercion_ops.ToDate,
                    opts: {
                        format: "YYYYMMDD" // e.g. "2009-03-21"
                    }
                },
                'Pageviews': {
                    do: import_datatypes.Coercion_ops.ToInteger
                }
            },

            //
            //
            fe_designatedFields: {
                objectTitle: "id",
            },
            fe_views: {
                gallery: false,
                choropleth: false,
                chart: true,
                scatterplot: true,
                timeline: false,
                wordCloud: false,
                lineGraph: true
            },
            fe_default_view: 'chart',
            fe_excludeFields: [
                "id"
            ],
            fe_outputInFormat: {},
            fe_filters_fieldsNotAvailable: [
                "Landing Page",
                "Pages Session",
                "Session Duration",
                "Pageviews",
                "Hour",
                "Minute",
                "Sessions",
                "Minute Index",
                "Date"
            ],

            fe_filters_valuesToExcludeByOriginalKey: {
                _all: ["", null]
            },
            fe_chart_defaultGroupByColumnName_humanReadable: "Motivation",
            fe_chart_fieldsNotAvailableAsGroupByColumns: [
                "Minute_Index",
                "Date",
                "Hour",
                "Minute",
                "Sessions",
                "Session Duration",
                "Pageviews",
                "Pages Session",
                "Landing Page",
            ],
            fe_chart_valuesToExcludeByOriginalKey: {
                _all: ["", null, "NULL", "(not specified)", "NA"],
            },
            fe_scatterplot_fieldsMap: {
                'Object Title': 'Motivation'
            },
            fe_scatterplot_fieldsNotAvailable: [
                "Institution",
                "Date",
                "Date2",  //delete after reworking CSV
                "Hour",
                "Minute",
                "Motivation",
                "Session Duration",
                "Pages Per Session",
                "Landing Page",
                "User Type", 
                "Traffic Type",
                "Operating System",
                "Minute Index",
                "City",
                "Region",
                "Country"
            ],
            fe_scatterplot_defaults: {
                xAxisField: 'Pageviews',
                yAxisField: 'Sessions'
            },

            fe_scatterplot_tooltip_term: "Visitor Records",
            ////////////

            fe_timeline_defaultSortByColumnName_humanReadable: "Date",
            fe_lineGraph_defaultGroupByColumnName_humanReadable: "Date",
            fe_lineGraph_fieldsNotAvailableAsGroupByColumns: [
                "Institution",
                "Date2",  //delete after reworking CSV
                "Hour",
                "Minute",
                "Motivation",
                "Session Duration",
                "Pages Per Session",
                "Landing Page",
                "User Type", 
                "Traffic Type",
                "Operating System",
                "Minute Index",
                "City",
                "Region",
                "Country",
                "Sessions", 
                "Pageviews",
                "Pages Session"
            ],
            fe_lineGraph_stackByColumnName_humanReadable: "Motivation",
            fe_lineGraph_defaultAggregateByColumnName_humanReadable: "Sessions",
            fe_lineGraph_aggregateByColumnName_numberOfRecords_notAvailable: false,
            // fe_lineGraph_keywordLineColors: {  //This property appears to not be working
            //     'Explorer': '#33B1B1',
            //     'Facilitator': '#9533F8',
            //     'Professional': '#FEB600',
            //     'Recharger': '#99D8D8',
            //     'Seeker': '#4D8DFF',
            // },
            fe_lineGraph_stackedLineColors: {
                'Explorer': '#33B1B1',
                'Facilitator': '#9533F8',
                'Professional': '#FEB600',
                'Recharger': '#F0141E',
                'Seeker': '#4D8DFF',
            },
            fe_lineGraph_outputInFormat: {
                Date: {
                    format: "MMM DD"
                }
            },
            fe_lineGraph_defaultKeywordsColumnName_humanReadable: "Motivation"

        }
    ];