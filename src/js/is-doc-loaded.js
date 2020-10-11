;(() => {
    let isDocumentLoaded = false;
    let queue = [];

    window.addEventListener("load", () => {
        isDocumentLoaded = true;

        queue.forEach(cb => cb());
        queue.length = 0;
    }, { once: true });

    // TODO переписать в модульном стиле
    window.isDocLoaded = function(cb) {
        if (typeof cb !== "function") return isDocumentLoaded;

        if (isDocumentLoaded) {
            cb();
        }
        else {
            queue.push(cb);
        }

        return isDocumentLoaded;
    };
})();