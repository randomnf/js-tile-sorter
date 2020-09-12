"use strict";

const fs = require("fs");
const gulp = require("gulp");
const rename = require("gulp-rename");
const pug = require("gulp-pug");
const sass = require("gulp-sass");
const cssmin = require("gulp-clean-css");
const jsmin = require("gulp-uglify-es").default;
const sourcemaps = require("gulp-sourcemaps");
const imgResizer = require("gulp-image-resize");
const bs = require("browser-sync").create();

const {src, dest, watch, series, parallel} = gulp;

module.exports.default = series(html, css, js, imgmin, parallel(watchFiles, browserSync));

const SRC_GLOBS = {
    pug:        "./src/pug/index.pug",
    scssIndex:  "./src/scss/index.scss",
    scss:       "./src/scss/*.scss",
    js:         "./src/js/*.js",
    img:        "./src/img/*.*",
};

const data = JSON.parse(fs.readFileSync("./data/works.json"));
const tags = JSON.parse(fs.readFileSync("./data/tags.json"));
const usedTags = new Set();

function html() {
    return src(SRC_GLOBS.pug)
        .pipe( pug({
            locals: {
                data: (() => {
                    usedTags.clear();

                    return data.map(item => {
                        const newItem = {
                            ...item
                        };

                        newItem.tags = tags.filter(item => {
                            const isChosen = Math.round(Math.random());

                            if (isChosen) {
                                usedTags.add(item);
                            }

                            return isChosen;
                        });

                        if (newItem.tags.length === 0) {
                            const index = Math.round(Math.random() * (tags.length - 1));
                            newItem.tags.push(tags[index]);
                            usedTags.add(tags[index]);
                        }

                        newItem.tagsStr = newItem.tags.map(item => item.code).join(",");

                        return newItem;
                    })
                })(),
                tags: [ ...usedTags.values() ],
            }
        }) )
        .pipe( dest("./build/") );
}

function css() {
    return src(SRC_GLOBS.scssIndex)
        .pipe( sass() )
        .pipe( cssmin() )
        .pipe( rename({
            basename: "style",
            suffix: ".min",
        }) )
        .pipe( dest("./build/css/") );
}

function js() {
    return src(SRC_GLOBS.js)
        // .pipe( sourcemaps.init() )
        // .pipe( jsmin() )
        .pipe( rename({
            suffix: ".min",
        }) )
        // .pipe( sourcemaps.write("./") )
        .pipe( dest("./build/js/") );
}

function imgmin() {
    return src(SRC_GLOBS.img)
        .pipe( imgResizer() )
        .pipe( dest("./build/img/") );
}

function watchFiles() {
    watch(SRC_GLOBS.pug, html);
    watch(SRC_GLOBS.scss, css);
    watch(SRC_GLOBS.js, js);
    watch(SRC_GLOBS.img, imgmin);
}

function browserSync() {
    bs.init({
        watch: true,
        server: {
            baseDir: "build",
            index: "index.html"
        },
        notify: false,
        ui: false,
    });
}