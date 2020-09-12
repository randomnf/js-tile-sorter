class TileSorter {
    constructor({
        controlSelector,
        tileSelector,
        activeClassName,
        disabledClassName,
        initByClick = true,
        duration = 500,
        timingFunction,
    }) {
        if (!controlSelector || !tileSelector) {
            console.error("TileSorter: no controlSelector and/or tileSelector prop(s) provided.");
            return;
        }

        const isClassSelector = controlSelector[0] === ".";
        const controlsClassName = controlSelector.slice(1);
        const statePrefix = isClassSelector ? `${controlsClassName}--` : "";

        this._controlSelector = controlSelector;
        this._activeClassName = activeClassName || `${statePrefix}active`;
        this._disabledClassName = disabledClassName || `${statePrefix}disabled`;
        this._initByClick = initByClick;
        this._duration = duration;
        this._timingFn = timingFunction || this._linearTimingFn;

        this._tags = [];
        this._resetFilterControl = null;
        this._controls = [];

        [ ...document.querySelectorAll(controlSelector) ].forEach(DOMNode => {
            const { tag } = DOMNode.dataset;

            if (tag === "*") {
                this._resetFilterControl = DOMNode;
                return;
            }

            this._tags.push(tag);
            this._controls.push({
                DOMNode,
                tag,
            });
        });

        this._tiles = [ ...document.querySelectorAll(tileSelector) ].map(DOMNode => ({
            DOMNode,
            tags: DOMNode.dataset.tileTags.split(","),
        }));
        this._wrapper = {
            DOMNode: this._tiles[0].DOMNode.parentElement,
        };

        this._filterTags = [];
        this._validTags = [...this._tags];

        this._visibleTiles = [...this._tiles];
        this._hiddenTiles = [];

        this._onBeforeAnimationStart = this._onBeforeAnimationStart.bind(this);
        this._animationHandler = this._animationHandler.bind(this);
        this._onAnimationEnd = this._onAnimationEnd.bind(this);

        this._inited = false;
        window.addEventListener("load", this._init.bind(this), { once: true });
    }

    _init() {
        this._snapInitialState();

        document.addEventListener("click", this._controlsClickHandler.bind(this));

        if (!this._initByClick) {
            this._setInitialState();
        }
    }

    _snapInitialState() {
        const wrapper = this._wrapper;
        const wrapperDOMNode = wrapper.DOMNode;
        const wrapperStyle = getComputedStyle(wrapperDOMNode);
        wrapper.snappedSizes = {
            height:         wrapperDOMNode.offsetHeight,
            paddingTop:     parseFloat(wrapperStyle.paddingTop),
            paddingRight:   parseFloat(wrapperStyle.paddingRight),
            paddingBottom:  parseFloat(wrapperStyle.paddingBottom),
            paddingLeft:    parseFloat(wrapperStyle.paddingLeft),
            borderRight:    parseFloat(wrapperStyle.borderRightWidth),
            borderLeft:     parseFloat(wrapperStyle.borderLeftWidth),
        };

        // принудительно устанавливаем position: relative для враппера
        // чтобы корректно посчитать исходные координаты для тайлов
        wrapperDOMNode.style.position = "relative";

        let tilesInRow = 0;
        let prevTileTop = null;

        this._tiles.forEach(tile => {
            const { DOMNode } = tile;

            if (prevTileTop === null || DOMNode.offsetTop === prevTileTop) {
                tilesInRow++;
                prevTileTop = DOMNode.offsetTop;
            }

            tile.snappedSizes = {
                height: DOMNode.offsetHeight,
                top:    DOMNode.offsetTop,
            };
        });

        // TODO брать отступы у каждой тайлы?
        const tileStyle = getComputedStyle(this._tiles[0].DOMNode);
        this._tileDefaults = {
            display:    tileStyle.display,
            top:        this._tiles[0].snappedSizes.top,
            bottom:     parseFloat(tileStyle.marginBottom),
        };

        this._tilesInRow = tilesInRow;
        this._currentTileWidth = (
            wrapperDOMNode.offsetWidth
            - wrapper.snappedSizes.paddingRight
            - wrapper.snappedSizes.paddingLeft
            - wrapper.snappedSizes.borderRight
            - wrapper.snappedSizes.borderLeft
        ) / tilesInRow;
    }

    _controlsClickHandler(event) {
        const target = event.target.closest(this._controlSelector);

        if (!target) return;

        if (!this._inited) {
            this._setInitialState();
        }

        const filterTag = target.dataset.tag;
        const isNewTag = !target.classList.contains(this._activeClassName);

        if (filterTag === "*") {
            this._filterTags.length = 0;
        }
        else if (isNewTag) {
            this._filterTags.push(filterTag);
        }
        else {
            this._filterTags = this._filterTags.filter(item => item !== filterTag);
        }

        this._filter();
        this._updateControlsState(target);
        // TODO запилить проверку факта изменения фильтра?
        this._startAnimation();
    }

    _setInitialState() {
        this._animate(() => {
            this._wrapper.DOMNode.style.height = `${this._wrapper.snappedSizes.height}px`;

            this._tiles.forEach((tile, index) => {
                const { DOMNode } = tile;

                DOMNode.style = `
                    position: absolute;
                    top: ${tile.snappedSizes.top}px;
                    left: ${this._currentTileWidth * (index % this._tilesInRow)}px;
                    width: ${this._currentTileWidth}px;
                `;
                // запоминаем собственную высоту тайла и ставим обратно исходную
                // это нужно для выравнивания тайлов в строке по высоте
                tile.snappedSizes.selfHeight = DOMNode.offsetHeight;
                DOMNode.style.height = `${tile.snappedSizes.height}px`;
            });
        });

        this._inited = true;
    }

    _filter() {
        const isFilterReseted = this._filterTags.length === 0;

        this._hiddenTiles = [];

        if (isFilterReseted) {
            this._validTags = [...this._tags];
            this._visibleTiles = [...this._tiles];
        }
        else {
            const validTags = new Set();
            this._visibleTiles = [];

            this._tiles.forEach(tile => {
                if ( this._filterTags.every(tag => tile.tags.includes(tag)) ) {
                    tile.tags.forEach(tag => validTags.add(tag));
                    this._visibleTiles.push(tile);
                }
                else {
                    this._hiddenTiles.push(tile);
                }
            });

            this._validTags = [ ...validTags.values() ];
        }
    }

    _updateControlsState(clickedTarget) {
        const isFilterReseted = clickedTarget === this._resetFilterControl || !this._filterTags.length;

        clickedTarget.classList.toggle(this._activeClassName);

        this._controls.forEach(control => {
            const { DOMNode } = control;

            if (isFilterReseted) {
                DOMNode.classList.remove(this._activeClassName, this._disabledClassName);
                DOMNode.disabled = false;

                return;
            }

            const isDisabled = !this._validTags.includes(control.tag);
            DOMNode.classList.toggle(this._disabledClassName, isDisabled);
            DOMNode.disabled = isDisabled;
        });

        this._resetFilterControl.classList.toggle(this._activeClassName, isFilterReseted);
    }

    _startAnimation() {
        this._setAnimationData();
        this._animate(this._onBeforeAnimationStart);
        this._animationStartTime = null;
        console.log(
            this._tilesToAnimate
                .map(({ animationData }) => animationData)
                .filter(item => !item.hide)
        );
        this._animate(this._animationHandler);
    }

    _setAnimationData() {
        this._tilesToAnimate = [];

        const wrapper = this._wrapper;
        let currentRow = 0;
        let rowHeight = this._visibleTiles[0].snappedSizes.selfHeight;
        let rowToAdjust = null;
        let rowTop = wrapper.snappedSizes.paddingTop;

        this._tiles.forEach(tile => {
            const style = getComputedStyle(tile.DOMNode);
            // TODO не создавать массивы visible/hidden, а лепить индексы прямо на тайл?
            const visibleIndex = this._visibleTiles.indexOf(tile);
            tile.animationData = {
                hide:   false,
                appear: false,
            };

            if (visibleIndex !== -1) {
                const { selfHeight } = tile.snappedSizes;
                const currentRowTmp = Math.floor(visibleIndex / this._tilesInRow);
                const isNewRow = currentRow !== currentRowTmp;
                const isShiftOccurred = !isNewRow && selfHeight > rowHeight;
                currentRow = currentRowTmp;

                if (isNewRow) {
                    if (rowToAdjust !== null) {
                        this._adjustRowHeight(rowToAdjust, rowHeight);
                    }
                    rowToAdjust = null;
                    rowTop += (
                        this._visibleTiles[visibleIndex - 1].animationData.to.height
                        + this._tileDefaults.bottom
                    );
                }

                if (isShiftOccurred) {
                    rowToAdjust = currentRow;
                }

                rowHeight = isNewRow || isShiftOccurred ? selfHeight : rowHeight;

                const to = {
                    height: selfHeight < rowHeight ? rowHeight : selfHeight,
                    top:    rowTop,
                    left:   (
                        wrapper.snappedSizes.paddingLeft
                        + this._currentTileWidth * (visibleIndex % this._tilesInRow)
                    ),
                };
                tile.animationData.to = to;

                if (style.display !== "none") {
                    const from = {
                        height: parseFloat(style.height),
                        top:    parseFloat(style.top),
                        left:   parseFloat(style.left),
                    };
                    tile.animationData.from = from;

                    tile.animationData.diff = {
                        height: to.height - from.height,
                        top:    to.top - from.top,
                        left:   to.left - from.left,
                    };
                }
                else {
                    tile.animationData.appear = true;
                }
            }

            if ( this._hiddenTiles.includes(tile) ) {
                if (style.display === "none") return;

                tile.animationData.hide = true;
            }

            this._tilesToAnimate.push(tile);
        });

        if (rowToAdjust !== null) {
            this._adjustRowHeight(rowToAdjust, rowHeight);
        }

        const from = wrapper.DOMNode.offsetHeight;
        const to = (
            rowTop
            + this._visibleTiles[this._visibleTiles.length - 1].animationData.to.height
            + this._tileDefaults.bottom
            + wrapper.snappedSizes.paddingBottom
        );
        wrapper.animationData = {
            from,
            to,
            diff: to - from,
        };
    }

    _adjustRowHeight(rowToAdjust, rowHeight) {
        let tilesNotChanging = [];

        for (let i = rowToAdjust * this._tilesInRow, end = i + this._tilesInRow; i < end; i++) {
            const tile = this._visibleTiles[i];
            const { animationData: { to, from, diff } } = tile;
            to.height = rowHeight;
            diff.height = to.height - from.height;

            if (diff.height === 0 && diff.top === 0 && diff.left === 0) {
                tilesNotChanging.push(tile);
            }
        }

        // TODO splice?
        this._tilesToAnimate = this._tilesToAnimate.filter(tile => !tilesNotChanging.includes(tile));
    }

    _onBeforeAnimationStart() {
        this._tilesToAnimate.forEach(tile => {
            const { DOMNode, animationData: { to, appear } } = tile;

            if (appear) {
                DOMNode.style.display = this._tileDefaults.display;
                DOMNode.style.top = `${to.top}px`;
                DOMNode.style.left = `${to.left}px`;
                DOMNode.style.height = `${to.height}px`;
                DOMNode.style.transform = "scale(0)";
            }
        });
    }

    _linearTimingFn(timeFraction) {
        return timeFraction;
    }

    _animate(fn) {
        // cancelAnimationFrame(this._pendingRAF);
        this._pendingRAF = requestAnimationFrame(fn);
    }

    _animationHandler(time) {
        this._animationStartTime ||= time;
        const start = this._animationStartTime;
        let progress = (time - start) / this._duration;
        progress = progress > 1 ? 1 : progress;

        this._tilesToAnimate.forEach(tile => {
            const { DOMNode } = tile;
            const { from, diff, appear, hide } = tile.animationData;

            if (appear) {
                DOMNode.style.transform = `scale(${progress})`;
            }
            else if (hide) {
                DOMNode.style.transform = `scale(${1 - progress})`;
            }
            else {
                DOMNode.style.top = `${from.top + diff.top * progress}px`;
                DOMNode.style.left = `${from.left + diff.left * progress}px`;
                DOMNode.style.height = `${from.height + diff.height * progress}px`;
            }
        });

        const { from, diff } = this._wrapper.animationData;
        this._wrapper.DOMNode.style.height = `${from + diff * progress}px`;

        if (progress < 1) {
            this._animate(this._animationHandler);
        }
        else {
            this._animate(this._onAnimationEnd);
        }
    }

    _onAnimationEnd() {
        this._visibleTiles.forEach(tile => {
            const { DOMNode, animationData: { to } } = tile;
            DOMNode.style.top = `${to.top}px`;
            DOMNode.style.left = `${to.left}px`;
            DOMNode.style.height = `${to.height}px`;
            DOMNode.style.transform = "scale(1)";
        });
        this._hiddenTiles.forEach(({ DOMNode }) => {
            DOMNode.style.display = "none";
        });
        this._wrapper.DOMNode.style.height = `${this._wrapper.animationData.to.height}px`;
    }
}
