class TileSorter {
    constructor({
        controlSelector,
        tileSelector,
        activeClassName,
        disabledClassName,
        duration = 500,
        timingFunction,
        waitForLoad = false,
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
        this._duration = duration;
        this._timingFn = timingFunction || this._linearTimingFn;
        this._waitForLoad = waitForLoad;

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

        this._controlsClickHandler = this._controlsClickHandler.bind(this);
        this._onBeforeAnimationStart = this._onBeforeAnimationStart.bind(this);
        this._animationHandler = this._animationHandler.bind(this);
        this._onAnimationEnd = this._onAnimationEnd.bind(this);

        this._inited = false;
        // TODO переписать в модульном стиле
        if (waitForLoad) {
            window.isDocLoaded( this._init.bind(this) );
        }
        else {
            document.addEventListener("DOMContentLoaded", this._init.bind(this), { once: true });
        }
    }

    _init() {
        this._snapInitialState();
        this._setInitialState();
        document.addEventListener("click", this._controlsClickHandler);
    }

    _snapInitialState() {
        const wrapper = this._wrapper;
        const wrapperDOMNode = wrapper.DOMNode;
        const wrapperStyle = getComputedStyle(wrapperDOMNode);
        const wrapperDefaults = {
            height:         wrapperDOMNode.offsetHeight,
            paddingTop:     parseFloat(wrapperStyle.paddingTop),
            paddingRight:   parseFloat(wrapperStyle.paddingRight),
            paddingBottom:  parseFloat(wrapperStyle.paddingBottom),
            paddingLeft:    parseFloat(wrapperStyle.paddingLeft),
            borderTop:      parseFloat(wrapperStyle.borderTopWidth),
            borderRight:    parseFloat(wrapperStyle.borderRightWidth),
            borderBottom:   parseFloat(wrapperStyle.borderBottomWidth),
            borderLeft:     parseFloat(wrapperStyle.borderLeftWidth),
        };
        wrapper.defaults = wrapperDefaults;

        // принудительно устанавливаем position: relative для враппера
        // чтобы корректно посчитать исходные координаты для тайлов

        // TODO переписать через getClientBoundingRect без изменения position ?
        if (wrapperStyle.position === "static") {
            wrapperDOMNode.style.position = "relative";
        }

        let tilesInRow = 0;
        let prevTileTop = null;

        this._tiles.forEach(tile => {
            const {
                offsetHeight:   height,
                offsetTop:      top,
            } = tile.DOMNode;

            if (prevTileTop === null || top === prevTileTop) {
                tilesInRow++;
                prevTileTop = top;
            }

            tile.defaults = {
                height,
                top,
            };
        });

        // TODO брать отступы у каждой тайлы?
        const tileStyle = getComputedStyle(this._tiles[0].DOMNode);
        this._tileDefaults = {
            display:        tileStyle.display,
            marginBottom:   parseFloat(tileStyle.marginBottom),
        };

        this._tilesInRow = tilesInRow;
        this._currentTileWidth = (
            wrapperDOMNode.offsetWidth
            - wrapperDefaults.paddingRight
            - wrapperDefaults.paddingLeft
            - wrapperDefaults.borderRight
            - wrapperDefaults.borderLeft
        ) / tilesInRow;
    }

    _setInitialState() {
        this._animate(() => {
            const wrapper = this._wrapper;
            const { height } = wrapper.defaults;
            wrapper.DOMNode.style.height = `${height}px`;
            wrapper.currentHeight = height;

            // три раза обходим тайлы, чтобы избежать ненужных Forced Synchronous Layouts
            this._tiles.forEach((tile, index) => {
                const { DOMNode, defaults: { top, height } } = tile;
                const left = this._currentTileWidth * (index % this._tilesInRow);

                DOMNode.style = `
                    position: absolute;
                    top: ${top}px;
                    left: ${left}px;
                    width: ${this._currentTileWidth}px;
                `;

                tile.defaults.left = left;

                tile.currentState = {
                    display: this._tileDefaults.display,
                    top: 0,
                    left: 0,
                    height,
                    scale: 1,
                };
            });

            // запоминаем собственную высоту тайла и далее ставим обратно
            // это нужно для выравнивания тайлов в строке по высоте
            this._tiles.forEach(tile => {
                tile.defaults.selfHeight = tile.DOMNode.offsetHeight;
            });

            this._tiles.forEach(tile => {
                tile.DOMNode.style.height = `${tile.defaults.height}px`;
            });

            this._inited = true;
        });
    }

    _controlsClickHandler(event) {
        const target = event.target.closest(this._controlSelector);

        if (!target || !this._inited) return;

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
        const isFilterReseted = clickedTarget === this._resetFilterControl || this._filterTags.length === 0;

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
        this._setTargetStates();
        this._animate(this._onBeforeAnimationStart);
        this._animationStartTime = null;
        this._animate(this._animationHandler);
    }

    _setTargetStates() {
        this._tilesToAnimate = [];

        const wrapper = this._wrapper;
        let currentRow = 0;
        let rowHeight = this._visibleTiles[0].defaults.selfHeight;
        let rowToAdjust = null;
        let rowTop = wrapper.defaults.paddingTop;

        this._tiles.forEach(tile => {
            const { currentState } = tile;
            // TODO не создавать массивы visible/hidden, а лепить индексы прямо на тайл?
            const visibleIndex = this._visibleTiles.indexOf(tile);
            tile.targetState = {
                hide:   false,
                appear: false,
            };

            if (visibleIndex !== -1) {
                const { defaults } = tile;
                const { selfHeight } = defaults;
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
                        this._visibleTiles[visibleIndex - 1].targetState.to.height
                        + this._tileDefaults.marginBottom
                    );
                }

                if (isShiftOccurred) {
                    rowToAdjust = currentRow;
                }

                rowHeight = isNewRow || isShiftOccurred ? selfHeight : rowHeight;

                const to = {
                    height: selfHeight < rowHeight ? rowHeight : selfHeight,
                    top:    rowTop - defaults.top,
                    left:   (
                        wrapper.defaults.paddingLeft
                        + this._currentTileWidth * (visibleIndex % this._tilesInRow)
                    ) - defaults.left,
                };
                tile.targetState.to = to;

                if (currentState.display !== "none") {
                    const from = {
                        height: currentState.height,
                        top:    currentState.top,
                        left:   currentState.left,
                    };
                    tile.targetState.from = from;

                    tile.targetState.diff = {
                        height: to.height - from.height,
                        top:    to.top - from.top,
                        left:   to.left - from.left,
                    };
                }
                else {
                    tile.targetState.appear = true;
                }
            }

            if ( this._hiddenTiles.includes(tile) ) {
                if (currentState.display === "none") return;

                tile.targetState.hide = true;
            }

            this._tilesToAnimate.push(tile);
        });

        if (rowToAdjust !== null) {
            this._adjustRowHeight(rowToAdjust, rowHeight);
        }

        const from = wrapper.currentHeight;
        const to = (
            rowTop
            + this._visibleTiles[this._visibleTiles.length - 1].targetState.to.height
            + this._tileDefaults.marginBottom
            + wrapper.defaults.borderTop
            + wrapper.defaults.borderBottom
            + wrapper.defaults.paddingBottom
        );
        wrapper.targetState = {
            from,
            to,
            diff: to - from,
        };
    }

    _adjustRowHeight(rowToAdjust, rowHeight) {
        let tilesNotChanging = [];

        for (let i = rowToAdjust * this._tilesInRow, end = i + this._tilesInRow; i < end; i++) {
            const tile = this._visibleTiles[i];
            const { targetState: { to, from, diff } } = tile;
            to.height = rowHeight;
            diff.height = to.height - from.height;

            if (diff.height === 0 && diff.top === 0 && diff.left === 0) {
                tilesNotChanging.push(tile);
            }
        }

        // TODO splice?
        this._tilesToAnimate = this._tilesToAnimate.filter(tile => !tilesNotChanging.includes(tile));
    }

    _animationHandler(now) {
        this._animationStartTime ||= now;
        const start = this._animationStartTime;
        let progress = (now - start) / this._duration;
        progress = progress > 1 ? 1 : progress;

        this._tilesToAnimate.forEach(tile => {
            const { DOMNode, currentState } = tile;
            const { from, diff, appear, hide } = tile.targetState;

            if (appear) {
                DOMNode.style.transform = `translate(${currentState.left}px, ${currentState.top}px) scale(${progress})`;
                currentState.scale = progress;
            }
            else if (hide) {
                DOMNode.style.transform = `translate(${currentState.left}px, ${currentState.top}px) scale(${1 - progress})`;
                currentState.scale = 1 - progress;
            }
            else {
                const top = from.top + diff.top * progress;
                const left = from.left + diff.left * progress;
                const height = from.height + diff.height * progress;

                DOMNode.style.height = `${height}px`;
                DOMNode.style.transform = `translate(${left}px, ${top}px)`;

                currentState.top = top;
                currentState.left = left;
                currentState.height = height;
            }
        });

        const wrapper = this._wrapper;
        const { from, diff } = wrapper.targetState;
        const wrapperHeight = from + diff * progress;
        wrapper.DOMNode.style.height = `${wrapperHeight}px`;
        wrapper.currentHeight = wrapperHeight;

        if (progress < 1) {
            this._animate(this._animationHandler);
        }
        else {
            this._animate(this._onAnimationEnd);
        }
    }

    _onBeforeAnimationStart() {
        this._tilesToAnimate.forEach(tile => {
            if (tile.targetState.appear) {
                const { DOMNode, targetState: { to: { top, left, height } } } = tile;

                DOMNode.style.height = `${height}px`;
                DOMNode.style.transform = `translate(${left}px, ${top}px) scale(0)`;
                DOMNode.style.display = this._tileDefaults.display;

                tile.currentState = {
                    display: this._tileDefaults.display,
                    top,
                    left,
                    height,
                    scale: 0,
                };
            }
        });
    }

    _onAnimationEnd() {
        this._visibleTiles.forEach(tile => {
            const { DOMNode, currentState, targetState: { to: { top, left, height } } } = tile;
            DOMNode.style.height = `${height}px`;
            DOMNode.style.transform = `translate(${left}px, ${top}px) scale(1)`;

            currentState.top = top;
            currentState.left = left;
            currentState.height = height;
            currentState.scale = 1;
        });

        this._hiddenTiles.forEach(tile => {
            const { DOMNode, currentState } = tile;
            DOMNode.style.display = "none";
            currentState.display = "none";
        });

        const wrapper = this._wrapper;
        const { to: height } = wrapper.targetState;
        wrapper.DOMNode.style.height = `${height}px`;
        wrapper.currentHeight = height;
    }

    _linearTimingFn(timeFraction) {
        return timeFraction;
    }

    _animate(fn) {
        this._pendingRAF = requestAnimationFrame(fn);
    }
}
