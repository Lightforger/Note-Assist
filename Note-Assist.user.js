// ==UserScript==
// @name         Danbooru 2 Note Assist
// @description  For danbooru.donmai (2) - experimental text-detection script to automatically fit notes to text
// @author       itsonlyaname
// @namespace    itsonlyaname
// @include       http://*.donmai.us/posts/*
// @include      https://*.donmai.us/posts/*
// @include       http://donmai.us/posts/*
// @include      https://donmai.us/posts/*
// @version      1.0
// @downloadURL  https://raw.githubusercontent.com/Lightforger/Note-Assist/master/Note-Assist.user.js
// @grant        none
// ==/UserScript==


if (NA !== undefined && NA.error !== undefined) { NA.error.write('namespace conflict between noteAssist script and another script, variable "NA" already taken, this most likely means you have installed noteAssist twice'); }

// Global NA object & sub-sections
var NA = {};
NA.debug = {};
NA.error = {};
NA.styleNote = {};



// MAJOR note: having debug open (inspect element/console/firebug/...) makes the script a lot slower
//==========================================================
// Script settings    (defaults, once you save with the menu, it will always use the saved settings)
//==========================================================

NA.defaultSettings = {
    uiLeft: true,  // UI position //true = left side, over the tags list //false = top-right corner

    alwaysResize: true, // true = Dragged notes will always resize, except if shift is held  //false = only resize if shift if held

    clickResizeActive: true, // A click with the selected combination of ctrl & shift will resize the note, fitting it to text
    clickResizeCtrl: true,
    clickResizeShift: false,
    // Advanced settings

    forceEnd: 20000,  // number of miliseconds to let the code run before it's considered as "stuck".
    // on very large images, using 'generate all' you may hit this limit (gives a warning message, then force-aborts)

    debug: false       //show debug text & images
};


//==========================================================
// Assist functions - mostly copy/pasted from other sources, and globals
//==========================================================

NA.globals = {
    startTime: null,        //  startTime = Date.now();
    benchStart: null,       // benchStart = Date.now();
    benchStop: null,        //  benchStop = Date.now();
    eyedropperTarget: null,
    sampleRatio: null,
    fitToScreenRatio: 1 //Scale for when "Fit images to window" (official danbooru settings) is enabled

};


NA.benchmark = function (s) {
    if (!NA.settings.debug) { return; }

    if (s === 'start') {
        NA.globals.benchStart = Date.now();
        NA.globals.benchStop = Date.now();
        NA.debug.write('----------------------<br/>');
    }
    else {
        var previousStop = NA.globals.benchStop;
        NA.globals.benchStop = Date.now();
        NA.debug.write(s + (NA.globals.benchStop - previousStop) + ' (' + (NA.globals.benchStop - NA.globals.benchStart) + ')');
    }
};

NA.addGlobalStyle = function (css) {
    try {
        var elmHead, elmStyle;
        elmHead = document.getElementsByTagName('head')[0];
        elmStyle = document.createElement('style');
        elmStyle.type = 'text/css';
        elmHead.appendChild(elmStyle);
        elmStyle.innerHTML = css;
    }
    catch (e) {
        if (!document.styleSheets.length) {
            document.createStyleSheet();
        }
        document.styleSheets[0].cssText += css;
    }
};

// NA.$c('div', { id: 'id',class: 'class' })
NA.$c = function (type, params) {
    if (type === '#text') {
        return document.createTextNode(params);
    }
    var node = document.createElement(type);
    for (var i in params) {
        if (i == 'kids') {
            for (var j in params[i]) {
                if (typeof (params[i][j]) == 'object') {
                    node.appendChild(params[i][j]);
                }
            }
        } else if (i == 'style') {
            if (typeof (params[i]) == 'string') {
                node.style.cssText = params[i];
            } else {
                for (var j in params[i]) {
                    node.style[j] = params[i][j];
                }
            }
        } else if (i == 'class') {
            node.className = params[i];
        } else if (i == '#text') {
            node.appendChild(document.createTextNode(params[i]));
        } else {
            node.setAttribute(i, params[i]);
        }
    }
    return node;
};

// major errors that break the script, text tacked on bottom of the page, more user-friendly than alert()
// probably should make a setting to be able to disable it, but if these show up, the script won't work at all
NA.error.write = function (a) {
    var el = document.getElementById('noteAssist_ErrorLog');

    if (!el) {
        document.body.appendChild(NA.$c('div', { id: 'noteAssist_ErrorLog' }));
        el = document.getElementById('noteAssist_ErrorLog');
    }
    if (el) {
        el.innerHTML += a + '\n<br/>';
    }
};

// writes debug text in the sidebar
NA.debug.write = function (a) {
    if (!NA.settings.debug) { return; }
    var el = document.getElementById('debug_log');
    if (el) {
        el.innerHTML += a + '\n<br/>';
    }
};

NA.debug.bwslider = function () { // debug function for 'convertToBlackWhite'
    //var slider = document.getElementById('bwslider');
    ////console.log("slider changed to");
    //var img = document.getElementById('image');
    //var allCanvases = document.getElementsByTagName('canvas');
    //if (allCanvases && allCanvases.length > 0) {
    //    var color = 'black';
    //    if (document.getElementById('noteAssist_ui').getElementsByClassName('group1')[1].checked) color = 'white';
    //    var lastCanvas = allCanvases[allCanvases.length - 1];
    //    document.getElementById('bwsliderValue').innerHTML = slider.value;
    //    var context = lastCanvas.getContext('2d');
    //    context.drawImage(img, 0, 0, lastCanvas.width, lastCanvas.height, 0, 0, lastCanvas.width, lastCanvas.height);
    //    var imageData = context.getImageData(0, 0, lastCanvas.width, lastCanvas.height);

    //    NA.convertToBlackWhite(imageData, color, slider.value);

    //    context.putImageData(imageData, 0, 0);
    //}
};


NA.getMetaContents = function (name) {
    var el = document.getElementsByName(name)[0];
    if (el) { return el.content; }
    else {
        NA.debug.write('Could not read meta-content of: "' + name + '"');
        return false;
    }
};


//==========================================================
// Custom objects
//==========================================================

// A shape, blob of connected pixels, could be anything
// Properties:
//   .pixels = array containing each pixel's position in the imageData's Uint8ClampedArray
//   .pixels.length = number of pixels in the shape
//
//   .left, .top, .right, .bottom = bounding box positions of the shape on the image
//   .width .height = width/height of the bounding box
//   .size = size of the bounding box of the shape in pixels
NA.shape = function (pixels, imageDataWidth, imageDataHeight) {
    this.pixels = pixels;

    //this.size = pixels.length;
    if (imageDataWidth) {
        this.tempimageDataWidth = imageDataWidth;
    }
    if (imageDataHeight) {
        this.tempimageDataHeight = imageDataHeight;
    }

    // init split from creation for easier merging & benchmark purposes
    this.init = function () {
        var pixels = this.pixels;
        var width4 = this.tempimageDataWidth * 4;

        var smallest_left = 999999; // start with a very large value so the loop is sure to adjust it
        var largest_right = 0;

        var smallest_top = 999999;
        var largest_bottom = 0;

        for (var i = 0; i < pixels.length; i++) {
            var x = (pixels[i] % width4) / 4;
            var y = Math.floor(pixels[i] / width4);

            if (x < smallest_left) smallest_left = x;
            else if (x > largest_right) largest_right = x;


            if (y < smallest_top) smallest_top = y;
            else if (y > largest_bottom) largest_bottom = y;
        }


        this.left = smallest_left;
        this.top = smallest_top;
        this.right = largest_right;
        this.bottom = largest_bottom;

        this.width = (this.right + 1) - this.left; // +1 needed to be correct (shapes that are 1px wide have same left & right value => width would be 0)
        this.height = (this.bottom + 1) - this.top;

        this.size = this.width * this.height;
    };
};

// A shapeGroup, a group of shapes with similar area sizes that are close to eachother, almost all text ends up in a group, but has a fair amount of false positives
// Properties:
//   .shapes = array of shape objects
//   .shapes.length = number of shapes in the group
//
//   .left, .top, .right, .bottom = bounding box positions of the shapegroup on the image
//   .width .height = width/height of the bounding box
//   .size = size of the bounding box of the shapegroup in pixels
NA.shapeGroup = function (shapes) {
    this.shapes = shapes; // store shape objects, in case merging of shapegroups is needed

    var totalShapeSize = 0;
    for (var i = 0; i < shapes.length; i++) {
        totalShapeSize += shapes[i].size;
    }
    this.averageShapeSize = (totalShapeSize / shapes.length);

    //this.init = function () { }

    var smallest_left = 999999; // start with a very large value so the loop is sure to adjust it
    var largest_right = 0;

    var smallest_top = 999999;
    var largest_bottom = 0;

    for (var i = 0; i < shapes.length; i++) {
        if (shapes[i].left < smallest_left) smallest_left = shapes[i].left;
         if (shapes[i].right > largest_right) largest_right = shapes[i].right;

        if (shapes[i].top < smallest_top) smallest_top = shapes[i].top;
         if (shapes[i].bottom > largest_bottom) largest_bottom = shapes[i].bottom;
    }
    this.left = smallest_left;
    this.right = largest_right;
    this.top = smallest_top;
    this.bottom = largest_bottom;

    this.width = (this.right + 1) - this.left; // +1 needed to be correct (shapes that are 1px wide have same left & right value => width would be 0)
    this.height = (this.bottom + 1) - this.top;

    this.size = this.width * this.height;

};


//==========================================================
// Text detection
//==========================================================

NA.detectTextColor = function (imageData) {
    //=========================================
    // First check if the override isn't on
    //=========================================
    var textColorCheckboxes = document.getElementById('noteAssist_ui').getElementsByClassName('group1');
    if (textColorCheckboxes[0].checked) { return 'black'; }  // Black/dark text, never invert
    else if (textColorCheckboxes[1].checked) { return 'white'; }  // White/light text, always invert

    
    //=========================================
    // take the average brightness (luma) of the selected area, dark images are likely to have light text
    //=========================================
    var average_luma = 0;
    var pixelData = imageData.data;
    for (var i = pixelData.length - 4; i >= 0; i -= 4) {
        average_luma += pixelData[i];     // temporally use the variable to count total
        average_luma += pixelData[i + 1];
        average_luma += pixelData[i + 2];
    }
    average_luma = average_luma / (pixelData.length * 0.75); //pixelData.length includes 4th channel: alpha, which we didn't count
    // is now average

    NA.debug.write('luma: ' + average_luma);
    // higher than 130 => light image/area => likely to be dark text // much more accurate when just a single textbubble is selected

    var textColor = (average_luma < 130) ? 'white' : 'black';

    // add style to checkboxes's parent span element as visual feedback what the script detected
    if (textColor == 'black') {
        textColorCheckboxes[0].parentNode.style = "font-weight:bold";
        textColorCheckboxes[1].parentNode.style = "";
    }
    else if (textColor == 'white') {
        textColorCheckboxes[0].parentNode.style = "";
        textColorCheckboxes[1].parentNode.style = "font-weight:bold";

    }

    return textColor;
};


NA.convertToBlackWhite = function (imageData, textColor, cutOff) {
    var luma;

    var pixelData = imageData.data;
    if (textColor == "black") {
        if (!cutOff) cutOff = 186;
        for (var i = pixelData.length - 4; i >= 0; i -= 4) {
            luma = ((pixelData[i] + pixelData[i + 1] + pixelData[i + 2]) / 3);

            luma = luma < cutOff ? 0 : 255;

            //if (pixelData[i+3] === 0) luma=255; // turns transparent background white, allowing detection of dark letters
            //pixelData[i+3] = 255;               // but text on transparent = very rare

            pixelData[i] = luma;
            //pixelData[i + 1] = 0; // not used atm, faster if we don't have to clean it
            //pixelData[i + 2] = 0; // not used atm, faster if we don't have to clean it
        }
    }
    else { //white // copy/pasting this entire block is faster then doing "if (reversed)" several 100,000 times inside the loop
        if (!cutOff) cutOff = 100;
        //NA.debug.write('cutOff: ' + cutOff);
        for (var i = pixelData.length - 4; i >= 0; i -= 4) {
            luma = ((pixelData[i] + pixelData[i + 1] + pixelData[i + 2]) / 3);

            luma = luma > cutOff ? 0 : 255;

            pixelData[i] = luma;
            //pixelData[i + 1] = 0; // not used atm, faster if we don't have to clean it
            //pixelData[i + 2] = 0; // not used atm, faster if we don't have to clean it
        }

    }
};


NA.fillborder = function (data) {
    var width4 = data.width * 4;
    var pixels = data.data;
    var pixelsToCheck = [0];     // adding more starting points is slower for some reason
    var pixelsToCheckNext = [];
    var tar;

    pixels[0] = 100; //starting pixel is guaranteed to be black

    while (pixelsToCheck.length > 0) {
        for (var index = 0, l = pixelsToCheck.length; index < l; index++) {
            var i = pixelsToCheck[index];

            tar = (i - width4) - 4;  // UP-LEFT // putting the tar values in an array to get rid of the 7 extra "if()" calls is 25% slower
            if (pixels[tar] === 0) {            // if the target pixel is black
                pixels[tar] = 100;              // mark it
                pixelsToCheckNext.push(tar);    // add it to the array for next loop
            }
            tar = (i - width4);      // UP
            if (pixels[tar] === 0) {
                pixels[tar] = 100;
                pixelsToCheckNext.push(tar);
            }
            tar = (i - width4) + 4;  // UP-RIGHT
            if (pixels[tar] === 0) {
                pixels[tar] = 100;
                pixelsToCheckNext.push(tar);
            }
            tar = i - 4;             // LEFT
            if (pixels[tar] === 0) {
                pixels[tar] = 100;
                pixelsToCheckNext.push(tar);
            }
            tar = i + 4;             // RIGHT
            if (pixels[tar] === 0) {
                pixels[tar] = 100;
                pixelsToCheckNext.push(tar);
            }
            tar = (i + width4) - 4;  // DOWN-LEFT
            if (pixels[tar] === 0) {
                pixels[tar] = 100;
                pixelsToCheckNext.push(tar);
            }
            tar = (i + width4);      // DOWN
            if (pixels[tar] === 0) {
                pixels[tar] = 100;
                pixelsToCheckNext.push(tar);
            }
            tar = (i + width4) + 4;  // DOWN-RIGHT
            if (pixels[tar] === 0) {
                pixels[tar] = 100;
                pixelsToCheckNext.push(tar);
            }
        }

        pixelsToCheck = pixelsToCheckNext;
        pixelsToCheckNext = [];

        //if ((Date.now() - NA.globals.startTime) > NA.settings.forceEnd) { // this code seems to run pretty fast, don't really need anti-stuck here
        //    if(confirm('NoteAssist - ' +(Date.now() - NA.globals.startTime) / 1000+' seconds passed, continue? (at "fillBorder"')) {
        //        NA.globals.startTime = Date.now();
        //    }
        //    else {
        //        break;
        //    }
        //}
    }
};


NA.drawBorder = function (imageData) {
    var width4 = imageData.width * 4;
    var height = imageData.height;
    for (var i = 0; i < width4 ; i = i + 4) { // by row, pixel location
        imageData.data[i] = 0; //top row
        imageData.data[i + (imageData.data.length - width4)] = 0; //bottom row
    }

    for (var i = 1; i < (height - 1) ; i++) { // by column, can skip top & bottom
        imageData.data[(i * width4)] = 0; // left column
        imageData.data[(i * width4) + (width4 - 4)] = 0; // right column

    }
};


NA.getShapes = function (imageData) {
    var width4 = imageData.width * 4;
    var pixels = imageData.data;
    var pixelsAll = [];
    var pixelsToCheck = [];
    var pixelsToCheckNext = [];
    var allShapes = [];
    var tar;

    for (var outerIndex = (width4 * 2), ll = pixels.length ; outerIndex < ll; outerIndex = outerIndex + 4) { // top and bottom 2 rows will never contain any black pixels due to fillBorder, so can be skipped

        if (pixels[outerIndex] === 0) {   // we find a black pixel, floodfill from it
            pixelsAll = [outerIndex];     // all pixel locations found in this floodfill
            pixelsToCheck = [outerIndex]; // reset all arrays so we don't have any data from last floodfill
            pixelsToCheckNext = [];       //


            while (pixelsToCheck.length > 0) {
                for (var index = 0, l = pixelsToCheck.length; index < l; index++) {
                    var i = pixelsToCheck[index]; // i = selected pixel position in the pixel array


                    tar = (i - width4) - 4;  // UP-LEFT // putting the tar values in an array to get rid of the 7 extra "if()" calls is 25% slower
                    if (pixels[tar] === 0) {            // if the target pixel is black
                        pixels[tar] = 10;               // mark it
                        pixelsToCheckNext.push(tar);    // add it to the array for next loop
                        pixelsAll.push(tar);            // to store in shape object, not sure if needed, perhaps could be just a counter
                    }
                    tar = (i - width4);      // UP
                    if (pixels[tar] === 0) {
                        pixels[tar] = 10;
                        pixelsToCheckNext.push(tar);
                        pixelsAll.push(tar);
                    }
                    tar = (i - width4) + 4;  // UP-RIGHT
                    if (pixels[tar] === 0) {
                        pixels[tar] = 10;
                        pixelsToCheckNext.push(tar);
                        pixelsAll.push(tar);
                    }
                    tar = i - 4;             // LEFT
                    if (pixels[tar] === 0) {
                        pixels[tar] = 10;
                        pixelsToCheckNext.push(tar);
                        pixelsAll.push(tar);
                    }
                    tar = i + 4;             // RIGHT
                    if (pixels[tar] === 0) {
                        pixels[tar] = 10;
                        pixelsToCheckNext.push(tar);
                        pixelsAll.push(tar);
                    }
                    tar = (i + width4) - 4;  // DOWN-LEFT
                    if (pixels[tar] === 0) {
                        pixels[tar] = 10;
                        pixelsToCheckNext.push(tar);
                        pixelsAll.push(tar);
                    }
                    tar = (i + width4);      // DOWN
                    if (pixels[tar] === 0) {
                        pixels[tar] = 10;
                        pixelsToCheckNext.push(tar);
                        pixelsAll.push(tar);
                    }
                    tar = (i + width4) + 4;  // DOWN-RIGHT
                    if (pixels[tar] === 0) {
                        pixels[tar] = 10;
                        pixelsToCheckNext.push(tar);
                        pixelsAll.push(tar);
                    }
                }

                pixelsToCheck = pixelsToCheckNext;
                pixelsToCheckNext = [];
            }
            // floodfill is done
            if (pixelsAll.length > 4) { // 1-4pixel dots are barely large enough to see, pretty safe to ignore
                allShapes.push(new NA.shape(pixelsAll, imageData.width, imageData.height));
            }
        }
    }
    //loop done, we have all the shapes now


    NA.debug.write('shapes: ' + allShapes.length);

    return allShapes;
};


NA.getAverageShapeSize = function (allShapes) {
    var startIndex = 0;
    var endIndex = allShapes.length;
    if (allShapes.length > 7) {
        startIndex = Math.floor(allShapes.length * 0.25); // don't count bottom 25% & top 15%
        endIndex = allShapes.length - Math.floor(allShapes.length * 0.15);
    }

    var totalShapeSize = 0;
    var shapesCounted = 0;
    for (var i = startIndex; i < endIndex; i++) {
        if (allShapes[i].size > 20) { // don't count tiny shapes such as dots & background noise into the average // can't just delete them as some are part of real letters
            totalShapeSize += allShapes[i].size;
            shapesCounted++;
        }
    }
    if (shapesCounted > 0) {
        return (Math.round((totalShapeSize / shapesCounted) * 100) / 100);
    }
};


NA.connectShapes = function (allShapes, mode) {
    // ================================================================================================
    // get the average letter size, while filtering as many other shapes as possible
    // ================================================================================================
    
    allShapes.sort(function shapeSort(a, b) { // sort collections from small to large, this makes it easy to
        if (a.size < b.size) { return -1; }   // filter extremes as they are grouped at the start & end of array now.
        if (a.size > b.size) { return 1; }
        return 0;
    });
    var averageShapeSize = NA.getAverageShapeSize(allShapes); // get average, ignoring the bottom 25% & top 15% (extremes)
    if (averageShapeSize === undefined) { return; }
    NA.debug.write('averageShapeSize1: ' + averageShapeSize);


    // remove anything much larger than the average size
    for (var i = allShapes.length - 1; i >= 0; i--) {
        if (allShapes[i].size >= averageShapeSize * 10) {
            allShapes.splice(i, 1);
        }
    }

    // ==================================================================================
    // merge overlapping shapes
    // works quite well as most huge shapes such a textbubbles are already removed
    // ==================================================================================)

    var mergedIndexes = [];
    for (var indexOuter = allShapes.length - 1; indexOuter >= 0; indexOuter--) {
        if (allShapes[indexOuter] === undefined) { continue; }
        var base_top = allShapes[indexOuter].top;
        var base_bottom = allShapes[indexOuter].bottom;
        var base_left = allShapes[indexOuter].left;
        var base_right = allShapes[indexOuter].right;

        for (var indexInner = allShapes.length - 1; indexInner >= 0; indexInner--) {
            if (allShapes[indexInner] === undefined) { continue; }
            if (indexInner == indexOuter) { continue; } // don't compare to self

            if (base_top > allShapes[indexInner].bottom ||
               base_bottom < allShapes[indexInner].top ||
               base_left > allShapes[indexInner].right ||
               base_right < allShapes[indexInner].left) {
                // no overlap found
                continue;
            }
            else { // overlapping shapes found, merge them (includes joined edges = 1px overlap)

                mergedIndexes.push(indexOuter);
                allShapes[indexOuter].pixels = allShapes[indexOuter].pixels.concat(allShapes[indexInner].pixels);
                                              
                delete allShapes[indexInner]; // delete it so it can't merge into another shape
                                              // note, leaves a gap in the array as intended!
                //console.log('merged ' + indexInner + ' into ' + indexOuter);
            }


        }
    }
    // delete the gaps in the array, re-init the updated shapes
    for (var i = allShapes.length - 1; i >= 0; i--) {
        if (allShapes[i] === undefined) {
            allShapes.splice(i, 1);
        }
        if (mergedIndexes.indexOf(i) != -1) {
            allShapes[i].init();
        }
    }

    //NA.benchmark('T-mergeShapes T:');

    // =========================================
    // recount average after removing large shapse & merging overlaps
    // =========================================
    averageShapeSize = NA.getAverageShapeSize(allShapes); 
    NA.debug.write('averageShapeSize2: ' + averageShapeSize);

    // maxConnectDistance is the square root of the average shape's size ~= an average height or width of a letter
    var maxConnectDistance = Math.round(Math.sqrt(averageShapeSize));
    NA.debug.write('con: ' + maxConnectDistance);


    // ==================================================================================
    // calculate connectedHorizontal & connectedVertical, a more accurate average distance between 2 letters (based on distance between shapes)
    //  - maxConnectDistance is too inaccurate since spacing between letters varies greatly
    //  - maxConnectDistance can be used as "if 2 shapes are more than 1.5~2x maxConnectDistance apart, they are not likely the same shapeGroup"
    // so as a more accurate guideline, we take the average distance between shapes that are likely in the same group 
    // ==================================================================================
    
    var connectedHorizontal = [];
    var connectedVertical = [];

    for (var indexOuter = allShapes.length - 1; indexOuter >= 0; indexOuter--) {
        // anti-stuck
        if ((Date.now() - NA.globals.startTime) > NA.settings.forceEnd) { // anti-stuck
            if (confirm('NoteAssist - ' + (Date.now() - NA.globals.startTime) / 1000 + ' seconds passed, continue? (at "calculate connected"')) { // anti-stuck
                NA.globals.startTime = Date.now(); // anti-stuck
            } // anti-stuck
            else { // anti-stuck
                return; // anti-stuck
            } // anti-stuck
        } // anti-stuck
        var base_left = allShapes[indexOuter].left;
        var base_top = allShapes[indexOuter].top;

        var base_right = allShapes[indexOuter].right;
        var base_bottom = allShapes[indexOuter].bottom;

        var smallest_connectedHorizontal = 999999;
        var smallest_connectedVertical = 999999;
        for (var indexInner = allShapes.length - 1; indexInner >= 0; indexInner--) {
            // for each shape, find the closest shape to the left, and the shape above it (all 4 directions would just generate doubles)

            if (indexInner == indexOuter) { continue; } // don't compare to self
            
            var comp_left = allShapes[indexInner].left;
            var comp_top = allShapes[indexInner].top;
            
            var comp_right = allShapes[indexInner].right;
            var comp_bottom = allShapes[indexInner].bottom;

            // horizontal distance between 2 selected shapes
            var current_connectedHorizontal = (base_left - comp_right);
                                          // to connect horizontally, shapes must be on the same row, diagonal not included
            if (base_top < comp_bottom && // other shape shouldn't be completely above use -> other shape's bottom must be below our top  (more to top = smaller)
                base_bottom > comp_top && // other shape shouldn't be completely below us -> other shape's top must be above our bottom (more to bottom = larger) 
                current_connectedHorizontal > 1 && // shape is to our left
                current_connectedHorizontal <= maxConnectDistance && // but not too far away
                current_connectedHorizontal < smallest_connectedHorizontal) // the closest shape only
            {
                smallest_connectedHorizontal = current_connectedHorizontal; // (new) closest distance found

            }

            // vertical distance between 2 selected shapes
            var current_connectedVertical = (base_top - comp_bottom);
                                          // to connect vertical, shapes must be in the same column, diagonal not included
            if (base_left < comp_right && // other shape shouldn't be completely to our left
                base_right > comp_left && // other shape shouldn't be completely to our right
                current_connectedVertical > 1 && // other shape is above us
                current_connectedVertical <= maxConnectDistance && // but not too far away
                current_connectedVertical < smallest_connectedVertical) // the closest shape only
            {
                smallest_connectedVertical = current_connectedVertical; // (new) closest distance found

            }
            
        } //end of inner
        // if a connect was found, record it
        if (smallest_connectedHorizontal < 999999) {
            connectedHorizontal.push(smallest_connectedHorizontal);
        }
        if (smallest_connectedVertical < 999999) {
            connectedVertical.push(smallest_connectedVertical);
        }
    }
    //console.log(connectedHorizontal); //debug, logs the array of all connectedHorizontal's
    //console.log(connectedVertical);

    // calcuate the average connect distances
    var connectedHorizontalAverage = 0; //init to 0, if the connectedHorizontal array is empty, it will stay 0
    if (connectedHorizontal.length > 0) {
        for (var i = connectedHorizontal.length - 1; i >= 0; i--) {
            connectedHorizontalAverage += connectedHorizontal[i]; // temporally use the variable to calc the total
        }
        connectedHorizontalAverage = connectedHorizontalAverage / connectedHorizontal.length; // average
    }

    var connectedVerticalAverage = 0; //init to 0, if the connectedVertical array is empty, it will stay 0
    if (connectedVertical.length > 0) {
        for (var i = connectedVertical.length - 1; i >= 0; i--) {
            connectedVerticalAverage += connectedVertical[i];     // temporally use the variable to calc the total
        }
        connectedVerticalAverage = connectedVerticalAverage / connectedVertical.length; // average
    }

    var connectHorizontalMax = connectedHorizontalAverage * 2; // the multiplier could be tweaked as needed
    var connectVerticalMax = connectedVerticalAverage * 2;     // any shapes further away than this won't be connected

    connectHorizontalMax = (Math.round(connectHorizontalMax * 100) / 100); // round to 2 digits
    connectVerticalMax   = (Math.round(connectVerticalMax * 100) / 100);


    NA.debug.write('con-H-Max: ' + connectHorizontalMax);
    NA.debug.write('con-V-Max: ' + connectVerticalMax);
    //NA.benchmark('T-findConnects T:');

    // ==================================================================================
    // Shapes to Groups: take a shape, put it in a new group, find nearby other shapes and put them in the group
    //
    // we start with that 1 shape in the group, we look all around it if there's a nearby shape
    // if one is found, add it to the group
    // example: LastChecked starts at 0, shapegroup length starts at 1
    // check every shape at/beyond the LastChecked
    // loop runs once, LastChecked is now at 1, 2 elements get added, length goes up to 3
    // loop runs 2 times, LastChecked goes to 3, no more elements are found, loop breaks
    //
    // it might be possible to improve the performance by storing extra data on which shape is close to another shape in "calculate connectedHorizontal & connectedVertical"
    // instead of comparing every shape to every other shape again (takes N*N time, which does become slow with 1000+ shapes)
    // ==================================================================================

    var allShapeGroups = [];
    while (allShapes.length > 0) {
        var currentShapeGroup = allShapeGroups.length; // index of the current shapeGroup in allShapeGroups array (at the end -> create new group)
        var currentShapeGroupLastChecked = 0; // extra performance: only need to check shapes once
        allShapeGroups[currentShapeGroup] = [allShapes.splice((allShapes.length - 1), 1)[0]]; // create a new shapegroup and put a shape in it (removed from allshapes)
                                                                                              // note that splice returns an *array* of the removed items

        // allShapeGroups[currentShapeGroup].length = the number of shapes in our group
        // currentShapeGroupLastChecked             = (index of) the last shape we checked
        // find more shapes that we can connect to, add them to the group
        // will automatically stop once no more letters are found
        while (currentShapeGroupLastChecked < allShapeGroups[currentShapeGroup].length) {
            // anti-stuck
            if ((Date.now() - NA.globals.startTime) > NA.settings.forceEnd) { // anti-stuck
                if (confirm('NoteAssist - ' + (Date.now() - NA.globals.startTime) / 1000 + ' seconds passed, continue? (at "Shapes to Groups"')) { // anti-stuck
                    NA.globals.startTime = Date.now(); // anti-stuck
                } // anti-stuck
                else { // anti-stuck
                    return; // anti-stuck
                } // anti-stuck
            } // anti-stuck

            for (var allShapeIndex = allShapes.length - 1; allShapeIndex >= 0; allShapeIndex--) {
                //============================================================================================================================================================
                // connect logic: check connectHorizontalMax/connectVerticalMax distance in each direction
                // pro: works for comma's & appostrofe's
                // con: connects even if only a few pixels match
                //============================================================================================================================================================

                //console.log('comparing the ' + currentShapeGroupLastChecked + 'th element of group ' + currentShapeGroup + ' with shape index ' + allShapeIndex);
                var base_top = allShapeGroups[currentShapeGroup][currentShapeGroupLastChecked].top;
                var base_bottom = allShapeGroups[currentShapeGroup][currentShapeGroupLastChecked].bottom;

                var base_left = allShapeGroups[currentShapeGroup][currentShapeGroupLastChecked].left;
                var base_right = allShapeGroups[currentShapeGroup][currentShapeGroupLastChecked].right;

                var comp_top = allShapes[allShapeIndex].top;
                var comp_bottom = allShapes[allShapeIndex].bottom;
                var comp_left = allShapes[allShapeIndex].left;
                var comp_right = allShapes[allShapeIndex].right;

                // quite similar to "calculate connectedHorizontal & connectedVertical", but this does check in all directions
                // horizontal align
                if (base_top < comp_bottom && // other shape shouldn't be completely above use -> other shape's bottom must be below our top  (more to top = smaller)
                    base_bottom > comp_top) { // other shape shouldn't be completely below us -> other shape's top must be above our bottom (more to bottom = larger) 

                    //vertical align, check left
                    var distanceLeft = (base_left - comp_right);
                    if (distanceLeft > 0 && // shape is to our left
                    distanceLeft <= connectHorizontalMax) { // but not too far away
                        allShapeGroups[currentShapeGroup].push(allShapes.splice(allShapeIndex, 1)[0]); // take the shape out of the allShapes array and put it in this group
                    }
                    else {
                        //vertical align, check right
                        var distanceRight = (comp_left - base_right); // same as (base_right - comp_left ) * -1;
                        if (distanceRight > 0 && // shape is to our left
                        distanceRight <= connectHorizontalMax) { // but not too far away
                            allShapeGroups[currentShapeGroup].push(allShapes.splice(allShapeIndex, 1)[0]); // take the shape out of the allShapes array and put it in this group
                        }
                    }
                }
                // vertical align
                else if (base_left < comp_right && // other shape shouldn't be completely to our left
                        base_right > comp_left) { //  other shape shouldn't be completely to our right

                    var distanceUp = (base_top - comp_bottom);
                    if (distanceUp > 0 && // shape is above us
                    distanceUp <= connectVerticalMax) { // but not too far away
                        allShapeGroups[currentShapeGroup].push(allShapes.splice(allShapeIndex, 1)[0]); // take the shape out of the allShapes array and put it in this group
                    }
                    else {
                        var distanceDown = (comp_top - base_bottom); // same as (base_bottom - comp_top) * -1
                        if (distanceDown > 0 && // shape is above us
                        distanceDown <= connectVerticalMax) { // but not too far away
                            allShapeGroups[currentShapeGroup].push(allShapes.splice(allShapeIndex, 1)[0]); // take the shape out of the allShapes array and put it in this group
                        }
                    }
                } // end vertical align

            }
            // at this point we checked allShapeGroups[currentShapeGroup][currentShapeGroupLastChecked]
            // so increase the LastChecked by 1, and move on to the next shape in the group (if any)
            currentShapeGroupLastChecked++;
        }
        // at this point we completed a group, if there any shapes left not in a groupn -> the loop will continue, creating more groups
    }
    //NA.benchmark('T-shapesToGroups T:');
    NA.debug.write('groups: ' + allShapeGroups.length);
    // at this point, all shapes are part of a group, the looping is done

    // ===================================================================
    // group cleanup, delete small groups & groups with just background stuff
    // ===================================================================
    for (var i = allShapeGroups.length - 1; i >= 0; i--) {
        if (mode == 'full' && allShapeGroups[i].length <= 2) {
            allShapeGroups.splice(i, 1); // if a group contain only 1 or 2  shapes, then it is not text, only active in full mode
        }
        else { // turn it into a shapeGroup object
            allShapeGroups[i] = new NA.shapeGroup(allShapeGroups[i]);
        }
    }

    // if a group's average shape size is much smaller than the global average shape size, it's most likely noise
    if (mode == 'full') {
        for (var i = allShapeGroups.length - 1; i >= 0; i--) {
            //NA.debug.write('Group ' + i + ' average: ' + allShapeGroups[i].averageShapeSize); // pretty cool in combo with the draw number
            if (allShapeGroups[i].averageShapeSize < (averageShapeSize / 8)) {
                allShapeGroups.splice(i, 1);
            }
        }
    }

    // groups that are very flat or thin generally aren't text either (<10px in either dimension)
    for (var i = allShapeGroups.length - 1; i >= 0; i--) {
        if (mode == 'full') { // full mode will delete if either the width or height is below 7 & total size is <350
            if ((allShapeGroups[i].height < 7 || allShapeGroups[i].width < 7) && allShapeGroups[i].size < 350) {
                allShapeGroups.splice(i, 1);
            }
        }
        else { // other modes require both to be below 8 before it's deleted
            if (allShapeGroups[i].height < 8 && allShapeGroups[i].width < 8) {
                allShapeGroups.splice(i, 1);
            }
        }
    }
    //NA.benchmark('T-groupCleanup T:');

    // ================================================================================
    // connect shape groups that are close to eachother (multiple lines in a single textbubble)
    // ================================================================================

    var toRemoveIndexes = [];
    for (var indexOuter = allShapeGroups.length - 1; indexOuter >= 0; indexOuter--) {
        if (toRemoveIndexes.indexOf(indexOuter) != -1) continue;
        var base_top = allShapeGroups[indexOuter].top - maxConnectDistance * 2.5;
        var base_bottom = allShapeGroups[indexOuter].bottom + maxConnectDistance * 2.5;
        var base_left = allShapeGroups[indexOuter].left - maxConnectDistance * 2.5;
        var base_right = allShapeGroups[indexOuter].right + maxConnectDistance * 2.5;

        for (var indexInner = allShapeGroups.length - 1; indexInner >= 0; indexInner--) {
            if (toRemoveIndexes.indexOf(indexInner) != -1 || indexInner == indexOuter) continue;

            //console.log('indexOuter: '+indexOuter + ' connecting to '+indexInner+'\n'+
            //            base_top+' '+base_bottom+' '+base_left+' '+base_right+'\n'+
            //            allShapeGroups[indexInner].top + ' ' + allShapeGroups[indexInner].bottom + ' ' +
            //            allShapeGroups[indexInner].left + ' ' +allShapeGroups[indexInner].right + ' ' +
            //   (base_top > allShapeGroups[indexInner].bottom ||
            //    base_bottom < allShapeGroups[indexInner].top ||
            //    base_left > allShapeGroups[indexInner].right ||
            //    base_right < allShapeGroups[indexInner].left));
            if (base_top > allShapeGroups[indexInner].bottom ||
                base_bottom < allShapeGroups[indexInner].top ||
                base_left > allShapeGroups[indexInner].right ||
                base_right < allShapeGroups[indexInner].left) {
                // no shape group found
                continue;
            }
            else { // shape group is within range

                if (!(allShapeGroups[indexOuter].top > allShapeGroups[indexInner].bottom ||
                allShapeGroups[indexOuter].bottom < allShapeGroups[indexInner].top ||
                allShapeGroups[indexOuter].left > allShapeGroups[indexInner].right ||
                allShapeGroups[indexOuter].right < allShapeGroups[indexInner].left)) {
                    // if they already overlap even without the connect distance, then their center don't have to be aligned

                    allShapeGroups[indexOuter] = new NA.shapeGroup(allShapeGroups[indexOuter].shapes.concat(allShapeGroups[indexInner]));
                    toRemoveIndexes.push(indexInner);
                }
                else { // they don't overlap, but are close to eachother, only allow horizonal or vertical connects, not diagonal
                    var shapeBaseCenterHorizontal = (base_right + base_left) / 2;
                    var shapeBaseCenterVertical = (base_bottom + base_top) / 2;

                    var shapeCompCenterHorizontal = (allShapeGroups[indexInner].right + allShapeGroups[indexInner].left) / 2;
                    var shapeCompCenterVertical = (allShapeGroups[indexInner].bottom + allShapeGroups[indexInner].top) / 2;

                    if (Math.abs(shapeBaseCenterHorizontal - shapeCompCenterHorizontal) < (allShapeGroups[indexOuter].width/ 1.5) ||
                        Math.abs(shapeBaseCenterVertical - shapeCompCenterVertical) < (allShapeGroups[indexOuter].height / 1.5)) {

                        allShapeGroups[indexOuter] = new NA.shapeGroup(allShapeGroups[indexOuter].shapes.concat(allShapeGroups[indexInner]));
                        toRemoveIndexes.push(indexInner);
                        //break;
                    }
                }

            }
        }
    }
    for (var i = allShapeGroups.length - 1; i >= 0; i--) {
        if (toRemoveIndexes.indexOf(i) != -1) {
            allShapeGroups.splice(i, 1);
        }
    }

    //NA.benchmark('T-connectGroups T:');
    return allShapeGroups;
};


NA.noteLeftclick = function (e) {
    var noteBox;
    if (NA.settings.clickResizeActive && e && e.target) {
        if (((NA.settings.clickResizeCtrl && e.ctrlKey) ||
             (!NA.settings.clickResizeCtrl && !e.ctrlKey)) &&

             ((NA.settings.clickResizeShift && e.shiftKey) ||
             (!NA.settings.clickResizeShift && !e.shiftKey)))
        {
            if ($(e.target).hasClass('note-box')) {
                noteBox = e.target;
            }
            else if ($(e.target).parent().hasClass('note-box')) {
                noteBox = e.target.parentNode;
            }

            NA.snap('note', noteBox);
        }
    }
};


NA.ghostRightclick = function (e) {
    e.preventDefault();

    var noteDataId = this.getAttribute('data-id');
    if (noteDataId.indexOf('x') != -1) { // unsaved notes have data id's like -> 'xxxxxxxxxxx', once saved -> '1234568', only delete unsaved notes
        var noteContainer = document.getElementById('note-container');

        var toBeRemoved = noteContainer.querySelectorAll('[data-id="' + noteDataId + '"]');
        if (toBeRemoved[0]) { noteContainer.removeChild(toBeRemoved[0]); }
        if (toBeRemoved[1]) { noteContainer.removeChild(toBeRemoved[1]); }
    }
};


NA.filterOverlappingNotes = function (allShapeGroups) {
    var existingNotes = document.getElementsByClassName('note-box');
    for (var shapeGroupIndex = allShapeGroups.length - 1; shapeGroupIndex >= 0; shapeGroupIndex--) {
        var top = allShapeGroups[shapeGroupIndex].top;
        var bottom = allShapeGroups[shapeGroupIndex].bottom;
        var left = allShapeGroups[shapeGroupIndex].left;
        var right = allShapeGroups[shapeGroupIndex].right;

        //var size = (right - left) * (bottom - top);
        var size = allShapeGroups[shapeGroupIndex].size;

        for (var noteIndex = 0; noteIndex < existingNotes.length; noteIndex++) {
            var comp_top = parseInt(existingNotes[noteIndex].style.top, 10);
            var comp_bottom = comp_top + parseInt(existingNotes[noteIndex].style.height, 10);

            var comp_left = parseInt(existingNotes[noteIndex].style.left, 10);
            var comp_right = comp_left + parseInt(existingNotes[noteIndex].style.width, 10);

            if (top > comp_bottom ||
               bottom < comp_top ||
               left > comp_right ||
               right < comp_left) {
                continue; // no overlap, continue on to next note to compare with
            }
            else {
                // overlap found, calculate overlap area
                var overlap_left = Math.max(0, left, comp_left);
                var overlap_right = Math.min(right, comp_right);

                var overlap_top = Math.max(0, top, comp_top);
                var overlap_bottom = Math.min(bottom, comp_bottom);

                var overlap_area = (overlap_right - overlap_left) * (overlap_bottom - overlap_top);
                //NA.debug.write('overlap_ratio: ' + (overlap_area / size));
                if (overlap_area > size * 0.75) {
                    // the to-be-made note is at least 75% covered by an existing note
                    allShapeGroups.splice(shapeGroupIndex, 1); //remove the group
                    break; // stop the (inner)loop through notes, the (outer) loop through groups will continue with next
                }
            }
        }
    }
};


NA.ghostNote = function (mode) {
    if (mode == 'last') {
        var notes_all = document.getElementById('note-container').getElementsByClassName('note-box');

        var noteBox = notes_all[notes_all.length - 1];

        noteBox.className += ' ghostNote';
        noteBox.addEventListener('contextmenu', NA.ghostRightclick, false); //rightclick
        // noteLeftclick is bound in Note.create
    }
};


NA.snap = function (mode, theNote, x, y, width, height) {
    // ================================================================================
    // mode "note" = resize passed theNote to largest text found
    // mode "last" = does the same, but finds last note first
    // expands 5px before doing anything, to avoid cutting off letters that are just on the edge
    // ================================================================================
    // mode "full" = entire image, creates new notes instead of resizing existing
    // ignores text that already has a note over it
    // ================================================================================
    // mode "area" / "virtual" = pass x/y/width/height parameters // unused for now
    // scan area inside the parameters, create 1 note on largest text found
    // ================================================================================

    NA.globals.startTime = Date.now(); //start point for 'NA.settings.forceEnd'
    NA.benchmark('start');

    // ================================================================================
    // set variables, get some info from settings
    // ================================================================================
    var img = document.getElementById('image');
    //var imgHeight = Math.floor((img.naturalHeight - 2) * NA.globals.fitToScreenRatio); // don't remember why -2
    //var imgWidth = Math.floor((img.naturalWidth - 2) * NA.globals.fitToScreenRatio);
    var imgHeight = img.naturalHeight;
    var imgWidth = img.naturalWidth;
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    var generateAllButton = document.getElementById('noteAssist_generateAll');
    var imgStyleWidth = (parseInt(img.style.width, 10) || parseInt(img.width, 10));

    // set NA.globals.fitToScreenRatio
    if (NA.getMetaContents('always-resize-images') === 'true' && parseInt(img.style.height, 10) && img.naturalHeight) {
        NA.globals.fitToScreenRatio = (parseInt(img.style.height, 10) / img.naturalHeight); // height used in the style (resized by JS) / real height
    }

    // how much we are zoomed in compared to the sample, used as multiplier with note padding space
    NA.globals.sampleRatio = (imgStyleWidth / parseInt(img.getAttribute('data-large-width'), 10)); 

    var notePadding = Math.floor(4 * NA.globals.sampleRatio); //px, extra space added around the text
    var expand = Math.floor(5 * NA.globals.sampleRatio);      //px, will look outside the selected area by this distance (greatly reduces accidental letter clipping)


    var theNoteInner;
    if (mode == 'last' || mode == 'note') {
        if (mode == 'last') {
            var allNotes = document.getElementById('note-container').getElementsByClassName('note-box');
            theNote = allNotes[allNotes.length - 1];
        }
        theNoteInner = theNote.getElementsByClassName('note-box-inner-border')[0];

        x = Math.ceil(parseInt(theNote.style.left, 10) / NA.globals.fitToScreenRatio);
        y = Math.ceil(parseInt(theNote.style.top, 10) / NA.globals.fitToScreenRatio);
        width = Math.ceil(parseInt(theNote.style.width, 10) / NA.globals.fitToScreenRatio);
        height = Math.ceil(parseInt(theNote.style.height, 10) / NA.globals.fitToScreenRatio);


        // ================================================================================
        // expand selected area a bit, greatly reduces accidentally clipping few letters
        // ================================================================================
        x = x - expand;
        if (x < 0) { x = 0; }

        y = y - expand;
        if (y < 0) { y = 0; }

        width = width + (expand * 2);
        if (width > imgWidth) { width = imgWidth; }

        height = height + (expand * 2);
        if (height > imgHeight) { height = imgHeight; }

    } else if (mode == 'full') {
        x = 0;
        y = 0;
        width = imgWidth;
        height = imgHeight;
        generateAllButton.value = "Working...";
        generateAllButton.disabled = true;
    } else if (mode == 'virtual' || mode == 'area') {
        // x/y/width/height is set in the parameters
    }
    canvas.height = height; //set the canvas heights so we can draw on it
    canvas.width = width;


    NA.benchmark('T-miscStart T:');
    // ================================================================================
    // Convert the selected area on the image to a canvas so we can access the pixel data
    // ================================================================================
    //.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);

    context.drawImage(img, x, y, width, height, 0, 0, width, height);
    var imageData = context.getImageData(0, 0, width, height);



    NA.benchmark('T-areaToCanvas T:');
    // ================================================================================
    // A cheap & simple detection of the text color (which can be overriden by the menu)
    // ================================================================================

    var textColor = NA.detectTextColor(imageData); // guess the text color based on image brightness


    NA.debug.write('textColor: ' + textColor);
    NA.benchmark('T-detectTextColor T:');
    // ================================================================================
    // converts the selected area to black&white
    // The image iself uses the red channel, values "0" and "255"
    // The green & blue channels can be used for other data
    // ================================================================================

    NA.convertToBlackWhite(imageData, textColor);


    NA.benchmark('T-to B&W T:');
    // ================================================================================
    // make the outer edge of the border black
    // later on this helps eliminate all lines/letters that were cut off
    // ================================================================================

    NA.drawBorder(imageData);


    NA.benchmark('T-drawBorder T:');
    // ================================================================================
    // First, floodfill starting from the top left corner.
    // Removes all shapes connected to the border (background, cut-off, etc)
    // Any pixel that is "removed" has a value 100 (again, red channel)
    // ================================================================================

    NA.fillborder(imageData);


    NA.benchmark('T-fillBorder T:');
    // ================================================================================
    // Scan all pixels that still have a value of 0, store them into "shape" objects
    // ================================================================================

    var allShapes = NA.getShapes(imageData);

    if (allShapes.length === 0) {
        //*/// debug
        if (NA.settings.debug) {
        NA.debug.write('0 letters found(getShapes)');
            if (!document.getElementById('debug-canvas-spacer')) {
                document.getElementById('image-container').appendChild(NA.$c('div', { id: 'debug-canvas-spacer', style: 'height:1em;width:100%' })); //so the canvases go below the image
            }
            context.putImageData(imageData, 0, 0);
            document.getElementById('image-container').appendChild(canvas);
        }
        //*/// debug
        if (mode == 'full') {
            generateAllButton.value = "Generate all notes";
            generateAllButton.disabled = false;
        }
        return;
    }

    NA.benchmark('T-getShapes T:');

    for (var i = 0; i < allShapes.length; i++) {
        allShapes[i].init(); // doing init on creation or here doesn't change speed, just split for benchmarking purposes
    }
    //return;
    NA.benchmark('T-initShapes T:');
    //================================== debug - draw single letters (before connectShapes)
    //*///
    if (NA.settings.debug) {
        context.putImageData(imageData, 0, 0);
        context.strokeStyle = 'rgba(0,255,255,0.8)';
        context.lineWidth = 1;
        for (var i = 0; i < allShapes.length; i++) {
            context.strokeRect(allShapes[i].left, allShapes[i].top, (allShapes[i].right - allShapes[i].left), (allShapes[i].bottom - allShapes[i].top));
        }
        imageData = context.getImageData(0, 0, width, height);
        NA.benchmark('T-DrawLetters T:');
    }
    //*///


    // ================================================================================
    // Connect shapes with other nearby shapes into NA.shapeGroup objects
    // "Nearby" is defined as "< the square root of the average shape's size" (in pixels, may change for a better algorithm)
    // includes filtering of groups that are unlikely to be text
    // ================================================================================


    NA.debug.write('ConnectShapes-Start');
    var allShapeGroups = NA.connectShapes(allShapes, mode); // clears the allShapes variable, if it's still needed after this then pass allShapes.slice()
    NA.benchmark('T-connectShapes T:');
    
    //================================== debug - draw single letters (after connectShapes)
    /*///
    if (NA.settings.debug) {
        context.putImageData(imageData, 0, 0);
        context.strokeStyle = 'rgba(0,255,255,0.8)';
        context.lineWidth = 1;
        for (var i = 0; i < allShapes.length; i++) {
            context.strokeRect(allShapes[i].left, allShapes[i].top, (allShapes[i].right - allShapes[i].left), (allShapes[i].bottom - allShapes[i].top));
        }
        imageData = context.getImageData(0, 0, width, height);
        NA.benchmark('T-DrawLetters T:');
    }
    //*///


    if (!allShapeGroups || allShapeGroups.length === 0) {
        //*/// debug
        if (NA.settings.debug) {
            NA.debug.write('no shapes left after(connectShapes)');
            if (!document.getElementById('debug-canvas-spacer')) {
                document.getElementById('image-container').appendChild(NA.$c('div', { id: 'debug-canvas-spacer', style: 'height:1em;width:100%' })); //so the canvases go below the image
            }
            context.putImageData(imageData, 0, 0);
            document.getElementById('image-container').appendChild(canvas);
        }
        //*/// debug
        if (mode == 'full') {
            generateAllButton.value = "Generate all notes";
            generateAllButton.disabled = false;
        }
        return;
    }

    // ================================================================================
    // if mode is full, fire another "connectshapes" on each shapegroup
    // this improves accuracy when a page uses multiple fonts or text sizes
    // ================================================================================

    // not sure if needed, as it does slow down the script quite a bit, need more data first
    //if (mode == 'full') {

    //}



    //================================== debug - draw shapegroups
    //*
    if (NA.settings.debug) {
        context.putImageData(imageData, 0, 0);
        context.strokeStyle = 'rgba(255,255,255,0.8)';
        context.lineWidth = 1;
        context.fillStyle = 'white';
        context.font = 'bold 16px Arial';
        for (var i = 0; i < allShapeGroups.length; i++) {
            context.strokeRect(allShapeGroups[i].left, allShapeGroups[i].top, (allShapeGroups[i].right - allShapeGroups[i].left), (allShapeGroups[i].bottom - allShapeGroups[i].top));

            //context.fillText(i, allShapeGroups[i].left, allShapeGroups[i].top+8); // useful in combo with the group "average:" debug text
        }
        imageData = context.getImageData(0, 0, width, height);
        NA.benchmark('T-DrawShapeGroups T:');
    }
    //*/

    // ================================================================================
    // check if a shapeGroup is already covered by an existing note, if so, delete the group
    // could use a new name for the function
    // ================================================================================
    if (mode == 'full') {
        //document.getElementById('note-container').innerHTML = ''; // debug, remove all existing notes so it's easier to see ghost notes, debug

        NA.filterOverlappingNotes(allShapeGroups);
        NA.benchmark('T-filterOverlappingNotes T:');
    }
    // ================================================================================
    // mode "full" = create ghost notes for all shapeGroups
    // mode "note"/"last" = resizes the note to the largest found shapeGroup
    // ================================================================================

    if (mode == 'full') {
        // Create a note for every shapegroup

        NA.debug.write('creating ' + allShapeGroups.length + ' notes');
        var noteContainer = document.getElementById('note-container');
        noteContainer.style.display = 'none'; // temporally hide the note container to reduce the amount of screen redraws from new notes

        for (var i = 0; i < allShapeGroups.length; i++) {
            //NA.debug.write('creating note: \n' + ((allShapeGroups[i].left - notePadding) * NA.globals.fitToScreenRatio) + ' ' +
            //                                     ((allShapeGroups[i].top - notePadding) * NA.globals.fitToScreenRatio) + ' ' +
            //                                     (((allShapeGroups[i].right - allShapeGroups[i].left) + notePadding * 2) * NA.globals.fitToScreenRatio)+ ' ' +
            //                                     (((allShapeGroups[i].bottom - allShapeGroups[i].top) + notePadding * 2) * NA.globals.fitToScreenRatio));
            Danbooru.Note.create((allShapeGroups[i].left - notePadding) * NA.globals.fitToScreenRatio,
                                  (allShapeGroups[i].top - notePadding) * NA.globals.fitToScreenRatio,
                                  ((allShapeGroups[i].right - allShapeGroups[i].left) + notePadding * 2) * NA.globals.fitToScreenRatio,
                                  ((allShapeGroups[i].bottom - allShapeGroups[i].top) + notePadding * 2) * NA.globals.fitToScreenRatio);
            NA.ghostNote('last');

        }
        noteContainer.style.display = 'block';


        generateAllButton.value = "Generate all notes";
        generateAllButton.disabled = false;
        NA.benchmark('T-attachNotes T:');
    }
    else if (mode == 'note' || mode == 'last') {
        // find the largest shapegroup, and fit the note to it

        var largestShapeGroupIndex = 0;
        for (var i = 0; i < allShapeGroups.length; i++) {
            if (allShapeGroups[i].size > allShapeGroups[largestShapeGroupIndex].size) {
                largestShapeGroupIndex = i;
            }
        }
        var largestShapeGroup = allShapeGroups[largestShapeGroupIndex];

        //NA.debug.write('largestShapeGroup.size I: ' + i);
        //NA.debug.write('largestShapeGroup.size: ' + largestShapeGroup.size);
        //NA.debug.write('width*height: ' + width * height);
        //NA.debug.write('ratio: ' + (width * height) / largestShapeGroup.size);

        //NA.debug.write('NA.globals.fitToScreenRatio: ' + NA.globals.fitToScreenRatio);
        //NA.debug.write('resizing note: \n' + ((x + largestShapeGroup.left - notePadding) * NA.globals.fitToScreenRatio) +
        //               ' ' + ((y + largestShapeGroup.top - notePadding) * NA.globals.fitToScreenRatio) +
        //               ' ' + (((largestShapeGroup.right - largestShapeGroup.left) + notePadding * 2) * NA.globals.fitToScreenRatio) +
        //               ' ' + (((largestShapeGroup.bottom - largestShapeGroup.top) + notePadding * 2) * NA.globals.fitToScreenRatio));
        if (((width * height) / largestShapeGroup.size) < 36) { // if the resize ration is no bigger than 32 times, prevents notes snapping to tiny sizes
            theNote.style.left = ((x + largestShapeGroup.left - notePadding) * NA.globals.fitToScreenRatio) + 'px'; //x & y are the offsets of the selected area on the full image
            theNote.style.top = ((y + largestShapeGroup.top - notePadding) * NA.globals.fitToScreenRatio) + 'px';

            theNote.style.width = Math.max(10, ((largestShapeGroup.right - largestShapeGroup.left) + notePadding * 2) * NA.globals.fitToScreenRatio) + 'px'; // no smaller than 10px
            theNote.style.height = Math.max(10, ((largestShapeGroup.bottom - largestShapeGroup.top) + notePadding * 2) * NA.globals.fitToScreenRatio) + 'px';

            theNoteInner.style.width = Math.max(8, ((largestShapeGroup.right - largestShapeGroup.left) + (notePadding * 2) - 2) * NA.globals.fitToScreenRatio) + 'px'; // no smaller than 8px
            theNoteInner.style.height = Math.max(8, ((largestShapeGroup.bottom - largestShapeGroup.top) + (notePadding * 2) - 2) * NA.globals.fitToScreenRatio) + 'px';
        }
        NA.benchmark('T-resizeNote T:');
    }


    // ================================================================================
    // 
    // ================================================================================





    if (NA.settings.debug) {
        if (!document.getElementById('debug-canvas-spacer')) {
            document.getElementById('image-container').appendChild(NA.$c('div', { id: 'debug-canvas-spacer', style: 'height:1em;width:100%' })); //so the canvases go below the image
        }
        context.putImageData(imageData, 0, 0);
        document.getElementById('image-container').appendChild(canvas);
    }
    NA.benchmark('T-stop, Total T:');
};


//==========================================================
// Hook into danbooru code
//==========================================================

NA.danbooruHooks = function () { //adds our own code to the Danbooru.Note functions
    //=========================
    // Hook into Note.create & TranslationMode.start & TranslationMode.create_note
    // in case of updates, new source can be found at: raw.githubusercontent.com/r888888888/danbooru/master/app/assets/javascripts/notes.js
    //=========================

    // show the noteAssist window when starting translation mode
    var TranslationMode_start = Danbooru.Note.TranslationMode.start;
    Danbooru.Note.TranslationMode.start = function () {
        $('#noteAssist_ui').show();
        return TranslationMode_start.apply(this, arguments);
    };

    // snap & ghost when creating a new note
    var TranslationMode_create_note = Danbooru.Note.TranslationMode.create_note;
    Danbooru.Note.TranslationMode.create_note = function () {
        TranslationMode_create_note.apply(this, arguments);
        // args: function (e, x, y, w, h)
        var event = arguments[0];
        var w = arguments[3];
        var h = arguments[4];

        if (w > 9 || h > 9) { //check if a note was actually created, minimum note size: 10px
            if (event && ((NA.settings.alwaysResize && !event.shiftKey) || (!NA.settings.alwaysResize && event.shiftKey))) {
                NA.snap('last');
                NA.ghostNote('last');
            }
        }
    };

    // add listener for ctrl-click resize
    var create = Danbooru.Note.create;
    Danbooru.Note.create = function () {
        create.apply(this, arguments);

        var notes_all = document.getElementById('note-container').getElementsByClassName('note-box');
        var noteBox = notes_all[notes_all.length - 1];

        noteBox.addEventListener('click', NA.noteLeftclick, false);
    };
};


//==========================================================
// Single-note specific functions
//==========================================================

NA.styleNote.getActiveTextarea = function () {
    var textarea = document.activeElement;  //select active textarea (note edit window)
    if (textarea.nodeName !== 'TEXTAREA') { //if active element is not a textarea, select the last opened edit window
        textarea = null;
        var editWindows = document.getElementsByClassName('note-edit-dialog');
        var l = editWindows.length;
        if (l > 0) {
            for (var i = l - 1; i >= 0; i--) {
                var w = editWindows[i];
                if (w.style.display === 'block') {
                    textarea = w.getElementsByTagName('textarea')[0];
                }
            }
        }
    }
    return textarea;
};


NA.styleNote.addCss = function (e, data) {
    if (e && typeof e === "object") { // in case of notedropper, e = 'notedropper', kinda bad coding
        e.preventDefault(); //don't un-focus the textarea
    }

    var textarea = NA.styleNote.getActiveTextarea();
    if (textarea === null) { return; } //no active or visible note edit window found

    var value;
    if (e.target && e.target.id) { //get the targeted element
        var targetID = e.target.id;
        if (targetID === 'noteAssist_textBold') {
            value = 'bold';
        }
        else if (targetID === 'noteAssist_textItalic') {
            value = 'italic';
        }
        else if (targetID === 'noteAssist_textSizePlus') {
            value = 'sizePlus';
        }
        else if (targetID === 'noteAssist_textSizeMinus') {
            value = 'sizeMinus';
        }
        else if (targetID === 'noteAssist_textTn') {
            value = 'tn';
        }
        else {
            NA.error.write('NoteAssist - error in "addCss", invalid targetID: ' + targetID);
        }
    }
    else if (typeof e === 'string') { //not an event
        if (e === 'eyedropper') {
            value = 'eyedropper';
        }
    }
    else {
        NA.error.write('NoteAssist - error in "addCss" - e: ' + e);
    }

    //get selected text
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;

    if (end - start === 0 && value !== 'tn') {
        start = 0;
        end = textarea.textLength;
    }
    var fullText = textarea.value;
    var selectedText = textarea.value.substring(start, end);


    var startTag;
    var endTag;
    var startTagLength;
    var endTagLength;
    if (value === 'bold' || value === 'italic' || value === 'tn') {
        if (value === 'bold') {
            startTag = '<b>';
            endTag = '</b>';
        }
        else if (value === 'italic') {
            startTag = '<i>';
            endTag = '</i>';
        }
        else { //tn
            startTag = '<tn>';
            endTag = '</tn>';
        }
        startTagLength = startTag.length;
        endTagLength = endTag.length;

        if ((selectedText.substr(0, startTagLength) === startTag) && (selectedText.substr(selectedText.length - endTagLength) === endTag)) {
            //the text we selected already contains <b> at it's start & </b> at it's end, remove them.
            textarea.value = fullText.substr(0, start) + selectedText.substring(startTagLength, selectedText.length - endTagLength) + fullText.substr(end);
            textarea.setSelectionRange(start, (end - startTagLength - endTagLength));
        }
        else if ((fullText.substr(start - startTagLength, startTagLength) === startTag) && (fullText.substr(end, endTagLength) === endTag)) {
            //the text we selected is already fully wrapped in <b> </b> tags, remove them.
            textarea.value = fullText.substr(0, start - startTagLength) + selectedText + fullText.substr(end + endTagLength);
            textarea.setSelectionRange(start - startTagLength, end - startTagLength);
        }
        else {
            if (value === 'tn' && selectedText.length === 0) { //no text selected, tack the tn to the end of the text.
                textarea.value = fullText + startTag + endTag;
                textarea.setSelectionRange(fullText.length + startTagLength, fullText.length + startTagLength);
            }
            else { //no text selected, wrap all text in the tags
                textarea.value = fullText.substr(0, start) + startTag + selectedText + endTag + fullText.substr(end);
                textarea.setSelectionRange(start, (end + startTagLength + endTagLength));
            }
        }
    }
    else if (value === 'eyedropper') {
        textarea.addEventListener('mousedown', NA.styleNote.eyedropperHide, false);
        data = data.toUpperCase();

        //update the preview text
        if (data) {
            var eyedropperText = document.getElementById('noteAssist_eyedropperText');
            var eyedropperTextHex = document.getElementById('noteAssist_eyedropperTextHex');
            if (NA.globals.eyedropperTarget === 'noteAssist_textColor') {
                eyedropperText.style.color = data;
            }
            else {
                eyedropperText.style.backgroundColor = data;
            }
            eyedropperTextHex.innerHTML = data;
        }

        var existingData = '';
        var existingDataLength = 0;
        var addedSpanTags = false;
        if (selectedText.substr(0, 13) !== '<span style="') { //if no <span> tag exists, add it - no need to check for closing tag.
            selectedText = '<span style="">' + selectedText + '</span>';
            addedSpanTags = true;
        }
        else {
            existingData = selectedText.split('"')[1]; //takes the text in the first pair of quotes found.
            existingDataLength = existingData.length;
        }

        existingData = existingData.split(';');
        for (var i = existingData.length - 1; i >= 0; i--) {
            existingData[i] = existingData[i].trim(); //remove leading/trailing whitespace
            if (existingData[i].indexOf(NA.globals.eyedropperTarget === 'noteAssist_textColor' ? 'color:' : 'background-color:') === 0) { //find value that starts with 'color:' or 'background-color:' & remove it.
                existingData.splice(i, 1);
            }
        }
        existingData = existingData.join('; ');
        existingData += (existingData.length > 0 ? '; ' : '');

        if (NA.globals.eyedropperTarget === 'noteAssist_textColor') {
            data = existingData + 'color:' + data;
        }
        else { //noteAssist_textBackgroundColor
            data = existingData + 'background-color:' + data;
        }

        selectedText = selectedText.split('"');
        selectedText[1] = data;
        selectedText = selectedText.join('"');

        textarea.value = fullText.substr(0, start) + selectedText + fullText.substr(end);
        textarea.setSelectionRange(start, end + (data.length - existingDataLength) + (addedSpanTags ? 22 : 0)); //22 = '<span style=""></span>'



    }
    else if (value === 'sizeMinus' || value === 'sizePlus') {
        var existingData = '';
        var existingDataLength = 0;
        var addedSpanTags = false;
        if (selectedText.substr(0, 13) !== '<span style="') { //if no <span> tag exists, add it - no need to check for closing tag.
            selectedText = '<span style="">' + selectedText + '</span>';
            addedSpanTags = true;
        }
        else {
            existingData = selectedText.split('"')[1]; //takes the text in the first pair of quotes found.
            existingDataLength = existingData.length;
        }

        var oldFontSize = 100;
        var newFontSize;
        existingData = existingData.split(';');
        for (var i = existingData.length - 1; i >= 0; i--) {
            existingData[i] = existingData[i].trim(); //remove leading/trailing whitespace
            if (existingData[i].indexOf('font-size:') === 0) { //find value that starts with 'color:' or 'background-color:' & remove it.
                if (existingData[i].indexOf('%') !== -1) {
                    oldFontSize = parseInt(existingData[i].substring(existingData[i].indexOf(':') + 1), 10);
                }
                existingData.splice(i, 1);
            }
        }
        existingData = existingData.join('; ');

        if (value === 'sizeMinus') {
            if (oldFontSize <= 100) {
                newFontSize = oldFontSize - 10;
            }
            else {
                newFontSize = oldFontSize - 33;
            }
        }
        else if (value === 'sizePlus') {
            if (oldFontSize < 100) {
                newFontSize = oldFontSize + 10;
            }
            else {
                newFontSize = oldFontSize + 33;
            }
        }
        if (newFontSize < 40) { return; }
        else if (newFontSize % 100 === 99) { newFontSize += 1; }
        else if (newFontSize % 100 === 1) { newFontSize -= 1; }
        if (newFontSize === 100) { //remove the tag
            data = existingData;
        }
        else { //normal
            existingData += (existingData.length > 0 ? '; ' : '');
            data = existingData + 'font-size:' + newFontSize + '%';
        }

        selectedText = selectedText.split('"');
        selectedText[1] = data;
        selectedText = selectedText.join('"');

        textarea.value = fullText.substr(0, start) + selectedText + fullText.substr(end);
        textarea.setSelectionRange(start, end + (data.length - existingDataLength) + (addedSpanTags ? 22 : 0)); //22 = '<span style=""></span>'
    }
};


NA.styleNote.eyedropper = function (e) {
    e.preventDefault();

    var textarea = NA.styleNote.getActiveTextarea();
    if (textarea === null) { return; } //no active or visible note edit window found

    NA.globals.eyedropperTarget = e.target.id; //save the last clicked button ID to a global value so we know if it's text-color or background-color

    var size = 9;  //area to cut out (in pixels), centered on the mouse
    var zoom = 8;  //number of times to magnify (be sure to change the ones in the other 2 functions as well when changing these)
    var canvasSize = size * zoom;
    var eyedropperSection = document.getElementById('noteAssist_eyedropperSection');
    document.getElementById('noteAssist_eyedropperHint').style.display = 'block';
    document.body.style.cursor = 'crosshair';

    if (eyedropperSection && eyedropperSection.style.display) { //already exists and is initialized (style is '' if the "else" block below has not run yet)
        if (eyedropperSection.style.display !== 'block') {
            eyedropperSection.style.display = 'block';
        }
        document.getElementById('image').addEventListener('mousedown', NA.styleNote.eyedropperDragStart, false);
        document.getElementById('image').addEventListener('mouseup', NA.styleNote.eyedropperDragStop, false);

        var canvas = document.getElementById('eyedropperPreview_canvas');
        var context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height); //clear canvas
    }
    else {
        var mainContainer = document.getElementById('noteAssist_eyedropperSection');
        mainContainer.style.display = 'block';
        var previewContainer = NA.$c('div', {
            id: 'eyedropperPreview',
            style: 'position:absolute; top:3px; right:3px; width:' + canvasSize + 'px; height:' + canvasSize + 'px; border:1px solid black;'
        });
        var textContainer = NA.$c('div', {
            style: 'position:absolute; top:3px; left:3px; width:' + (200 - 9 - canvasSize) + 'px; height:' + canvasSize + 'px; border:1px solid black;' //9 = left padding & such
        });
        var canvas = NA.$c('canvas', {
            id: 'eyedropperPreview_canvas',
            height: canvasSize + 'px',
            width: canvasSize + 'px'
        });
        var imgEl = document.getElementById('image');

        previewContainer.innerHTML = '<img id="noteAssist_eyedropperPreview_pointer" style="position:absolute;" width="' + canvasSize + '" height="' + canvasSize + '" src="data:image/gif;base64,R0lGODlhUQBRAPAAAAAAAEBAQCH5BAEAAAAALAAAAABRAFEAAAJ/hI+py+0Po5y02ouz3rz7D4biSJbmiabqyrbuC8fyTNf2jef6zvf+DwwKh8Si8YhMKo2BZaPpXECjiakzgM1qrcynkosAE8UGstBs7m2f2i4jDUR/vUl5fbumwutUxR751yc4SFhoeIiYqLjI2Oj4CBkpOUlZaXmJmam5yQlUAAA7" />';
        textContainer.innerHTML = '<p id="noteAssist_eyedropperText" style="color:#FFFFFF; font-size:133%; margin-top: 5px; text-align:center"><b>bold</b><br/>Lorem Ipsum<br/><span id="noteAssist_eyedropperTextHex">#FFFFFF</span></p>';

        previewContainer.appendChild(canvas); //canvas in previewContainer
        mainContainer.appendChild(previewContainer); //previewContainer in (eyedropper) mainContainer
        mainContainer.appendChild(textContainer);    //textContainer in (eyedropper) mainContainer

        imgEl.addEventListener('mousedown', NA.styleNote.eyedropperDragStart, false);
        imgEl.addEventListener('mouseup', NA.styleNote.eyedropperDragStop, false);
        previewContainer.addEventListener('click', NA.styleNote.eyedropperPickDetail, false);

    }
    NA.styleNote.addCss('eyedropper', ''); //initiate a span with blank color
};


NA.styleNote.eyedropperDragStart = function (e) {
    e.preventDefault();

    document.getElementById('image').addEventListener('mousemove', NA.styleNote.eyedropperDrag, false);
    NA.styleNote.eyedropperDrag(e);
};


NA.styleNote.eyedropperDrag = function (e) {
    var size = 9;  //area to cut out (in pixels), centered on the mouse
    var zoom = 8;  //number of times to magnify (be sure to change the ones in the other 2 functions as well when changing these)
    var imgEl = document.getElementById('image');
    var canvas = document.getElementById('eyedropperPreview_canvas');
    var context = canvas.getContext('2d');


    var offset = Math.ceil(zoom / 2);

    //'getBoundingClientRect()' seems perfered over 'offsetLeft'? However, 'getBoundingClientRect()' gives wrong values when scrolled

    var x = (e.pageX - imgEl.offsetLeft) / NA.globals.fitToScreenRatio;
    if (x > offset) { x -= offset; }
    var y = (e.pageY - imgEl.offsetTop) / NA.globals.fitToScreenRatio;
    if (y > offset) { y -= offset; }

    context.drawImage(imgEl, x, y, size, size, 0, 0, size, size); //draw only the area we need to a temp. canvas
    //drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
    var pixels = context.getImageData(0, 0, size, size).data;               //extract the unzoomed pixel data.

    //draw zoom*zoom pixel boxes - simply upscaling the canvas produces very blurry and unusable results
    for (var x = 0; x < size; x++) {
        for (var y = 0; y < size; y++) {
            var i = x * 4 + y * 4 * size;
            context.fillStyle = 'rgb(' + pixels[i] + ', ' + pixels[i + 1] + ', ' + pixels[i + 2] + ')';
            context.fillRect(x * zoom, y * zoom, zoom, zoom);

            if (x === offset && y === offset) {
                NA.styleNote.addCss('eyedropper', context.fillStyle);
            }
        }
    }
};


NA.styleNote.eyedropperDragStop = function () {
    var imgEl = document.getElementById('image');
    imgEl.removeEventListener('mousemove', NA.styleNote.eyedropperDrag, false);
    imgEl.removeEventListener('mousedown', NA.styleNote.eyedropperDragStart, false);
    imgEl.removeEventListener('mouseup', NA.styleNote.eyedropperDragStop, false);
    document.getElementById('noteAssist_eyedropperHint').style.display = 'none';
    document.body.style.cursor = 'auto';
};


NA.styleNote.eyedropperHide = function () {
    this.removeEventListener('mousedown', NA.styleNote.eyedropperHide, false);

    var eyedropperSection = document.getElementById('noteAssist_eyedropperSection');
    if (eyedropperSection) {
        eyedropperSection.style.display = 'none';
        document.body.style.cursor = 'auto';
    }

    var canvas = document.getElementById('eyedropperPreview_canvas');
    var context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height); //clear canvas

    NA.styleNote.eyedropperDragStop();
};


NA.styleNote.eyedropperPickDetail = function (e) {
    var size = 9;  //area to cut out (in pixels), centered on the mouse
    var zoom = 8;  //number of times to magnify (be sure to change the ones in the other 2 functions as well when changing these)

    var x = e.offsetX;
    var y = e.offsetY;

    if (x === 0) { x = 1; } //strange bug, 1px above/left (but not below/right) of the canvas can be clicked
    if (y === 0) { y = 1; }

    x = Math.floor(x / zoom) * zoom; //round down to the nearest zoom value
    y = Math.floor(y / zoom) * zoom;

    var canvas = document.getElementById('eyedropperPreview_canvas');
    var context = canvas.getContext('2d');
    var data = context.getImageData(0, 0, size * zoom, size * zoom);               //extract the unzoomed pixel data.
    var pixels = data.data;

    var i = x * 4 + y * 4 * data.width;

    context.fillStyle = 'rgb(' + pixels[i] + ', ' + pixels[i + 1] + ', ' + pixels[i + 2] + ')'; //trick to easily convert rgb to #hex

    NA.styleNote.addCss('eyedropper', context.fillStyle);

    NA.styleNote.eyedropperHide();
};

//==========================================================
// Settings
//==========================================================

NA.initSettings = function () {
    try { //create LS_getValue & LS_setValue functions
        var keyPrefix = 'noteAssist.';
        NA.LS_getValue = function (name, defaultValue) {
            var value = localStorage.getItem(keyPrefix + name);
            if (!value) { return defaultValue; }
            var type = value[0];
            value = value.substring(1);
            switch (type) {
                case 'b':
                    return value == 'true';
                case 'n':
                    return Number(value);
                default:
                    return value;
            }
        };
        NA.LS_setValue = function (name, value) {
            value = (typeof value)[0] + value;
            localStorage.setItem(keyPrefix + name, value);
        };
    }
    catch (e) {
        NA.error.write('NoteAssist - critical error.\nLocal storage could not be accessed, details:\n' + e);
        return;
    }

    try {
        NA.settings = NA.LS_getValue('settings');

        if (NA.settings) {
            NA.settings = JSON.parse(NA.settings);
            //if a value exists in default settings but not in settings loaded from localstorage, add it (this happens if new versions add more settings)
            for (var key in NA.defaultSettings) {
                if (NA.defaultSettings.hasOwnProperty(key) && !NA.settings.hasOwnProperty(key)) {
                    NA.settings[key] = NA.defaultSettings[key];
                }
            }


        }
        else { NA.settings = NA.defaultSettings; } // no NA.settings found
    }
    catch (e) {
        // NA.debug.write not yet available 
        NA.settings = NA.defaultSettings; // error occured during parsing, fallback to defaults
    }

};


NA.settingsMenuCreate = function () {
    var overlay = NA.$c('div', {
        id: 'noteAssist_settingMenuOverlay',
        style: 'background-color:black; height:100%; width:100%; position:fixed; left:0px; top:0px; opacity:0.6; z-index: 9998;'
    });
    var settingMenu = NA.$c('div', {
        id: 'noteAssist_settingMenu'
    });

    settingMenu.innerHTML =
      '<p style="text-align:center; font-weight:bold; font-size:130%;">Note Assist Settings</p>' +
      '<div class="section">' +
        '<strong><p>Basic Settings</p></strong>' +

        '<span title="If enabled => position left, over the tags list -- If disabled => position top-right. (default: enabled)">' +
        '<input  id="noteAssist_uiLeft" type="checkbox" ' + (NA.settings.uiLeft ? 'checked' : '') + ' class="settingMenu_checkbox"/>' +
        '<label for="noteAssist_uiLeft"> UI position: left*</label></span></br>' +

        '<span title="If enabled => Notes created with drag&drop will always resize, unless shift is held -- If disabled => only resize when shift is held. (default: enabled)">' +
        '<input  id="noteAssist_alwaysResize" type="checkbox" ' + (NA.settings.alwaysResize ? 'checked' : '') + ' class="settingMenu_checkbox"/>' +
        '<label for="noteAssist_alwaysResize"> Always resize new note</label></span></br>' +

        '<hr/><span title="A click with the selected combination of ctrl & shift will resize the note, fitting it to text">Clicking a note will resize it:</br>' +
        '' +
        '<input  id="noteAssist_clickResizeActive" type="checkbox" ' + (NA.settings.clickResizeActive ? 'checked' : '') + ' class="settingMenu_checkbox">' +
        '<label for="noteAssist_clickResizeActive"> Enabled &nbsp;&nbsp;&nbsp;&nbsp;</label></span>' +
        '<input  id="noteAssist_clickResizeCtrl" type="checkbox" ' + (NA.settings.clickResizeCtrl ? 'checked' : '') + ' class="settingMenu_checkbox">' +
        '<label for="noteAssist_clickResizeCtrl"> Ctrl &nbsp;&nbsp;&nbsp;&nbsp;</label>' +
        '<input  id="noteAssist_clickResizeShift" type="checkbox" ' + (NA.settings.clickResizeShift ? 'checked' : '') + ' class="settingMenu_checkbox">' +
        '<label for="noteAssist_clickResizeShift"> Shift</label>' +
            
        '' +
        '' +
        '' +

      '</div>' +
      '<div class="section">' +
        '<strong><p>Advanced Settings</p></strong>' +

        '<span title="How long the code will run (freezing your browser) before giving up. (default: 15000)">' +
        '<input type="text" id="noteAssist_forceEnd" value="' + (typeof NA.settings.forceEnd === 'number' ? NA.settings.forceEnd : NA.defaultSettings.forceEnd) + '" class="settingMenu_checkbox"/><label for="noteAssist_forceEnd"> Force abort timer (ms)</label></span></br>' +

        '<span title="Displays additional text/images/messages about the script\'s inner workings (only for programmers). Note, debug is active if this OR the value in the script is true">' +
        '<input type="checkbox" id="noteAssist_debug" ' + (NA.settings.debug ? 'checked' : '') + ' class="settingMenu_checkbox"/><label for="noteAssist_debug"> Debug mode*</label></span></br>' +
      '</div>' +
      '' +
      '' +
      '<p style="position:absolute; bottom:0; font-size:70%;">*Requires F5</p>' +
      '<input type="button" id="noteAssist_settingsSave" value="Done" title="Clicking outside this window also closes it"/>' +
      '';

    var style =
      '#noteAssist_settingMenu { background-color:#C6C6C6; height:350px; width:350px; position:absolute; left:70px; top:70px; z-index:9999; border:10px ridge #3B3EEE; padding:9px; }' +
      '#noteAssist_settingMenu p { margin-bottom:0.5em; }' +
      '#noteAssist_settingMenu div.section { border:1px solid black; padding:4px; margin-bottom:1em; }' +
      '#noteAssist_settingMenu input[type="checkbox"] { width:16px; height:22px; }' +
      '#noteAssist_settingMenu input[type="text"]     { width:5em; margin-bottom:5px; }' +
      '#noteAssist_settingMenu #noteAssist_settingsSave { position:absolute; bottom:5px; right:5px; }';

    NA.addGlobalStyle(style);

    document.body.appendChild(overlay);
    document.body.appendChild(settingMenu);

    overlay.addEventListener('click', NA.settingsMenuClose, false);
    document.getElementById('noteAssist_settingsSave').addEventListener('click', NA.settingsMenuSave, false);

};


NA.settingsMenuSave = function () {
    var new_settings = {};

    var inputs = document.getElementById('noteAssist_settingMenu').getElementsByTagName('input');
    for (var i = 0; i < inputs.length; i++) {
        var key = inputs[i].id.replace(/^noteAssist_/, '');


        if (inputs[i].type === 'checkbox') { // save all checkboxes as boolean
            new_settings[key] = inputs[i].checked;
        }
        else if (inputs[i].type === 'text') { // save all text fields by their value
            var inputValue = inputs[i].value;

            if (inputValue.length > 0) { // basic validation, textfield must contain text

                if (key === 'forceEnd' && isNaN(parseInt(inputValue, 10))) { // basic validation, "forceEnd" field must contain text
                    alert('NoteAssist - Error, "Force abort timer" must be a number');
                    return;
                }
                new_settings[key] = inputValue;
            }
            else {
                alert('NoteAssist - Error, input field(s) cannot be blank');
                return;
            }
        }
    }

    NA.LS_setValue('settings', JSON.stringify(new_settings));
    NA.settings = new_settings;

    //done saving, remove the setting menu & overlay now.
    NA.settingsMenuClose();
};


NA.settingsMenuClose = function () {
    $('#noteAssist_settingMenu').remove();
    $('#noteAssist_settingMenuOverlay').remove();
};
//==========================================================
// UI
//==========================================================

NA.initUi = function () {
    var container = NA.$c('div', {
        id: 'noteAssist_ui'
    });

    container.innerHTML =
      '<style type="text/css">' +
      '#noteAssist_ui { width:200px; position:fixed; z-index:2000; display:none; ' + //
      (NA.settings.uiLeft ? 'top:33%; left:5px; ' : 'top:5px; right:5px;') +                   // main container div /*(document.documentElement.clientHeight*0.32)*/
      'border: 6px ridge #3B3EEE; background-color:white; font-size:87.5%; padding:5px; }' +          //
      '.radiobutton { margin-left:8px; }' +
      '#noteAssist_ui p { margin-bottom:0px; }' +
      '#noteAssist_ui input { margin-bottom:7px; }' +
      '#noteAssist_ui input[type="button"] { font-size:90%; }' +
      '#noteAssist_singleNoteSection, #noteAssist_eyedropperSection { border-top: 2px solid black; position:relative; }' +
      '#noteAssist_eyedropperSection { min-height:90px; display:none; }' +
      '' +
      '</style>' +

      '<input type="button" id="noteAssist_generateAll" value="Generate all notes" title="Scans the image (takes 1 to 15+ seconds, based on width*height) and attempts to detect any text, automatically generating notes"/>' +
      '<p style="display:inline-block; float:right; font-weight:bold; padding-top:5px">Note Assist</p>' +
      '<p id="noteAssist_closeMain" title="Close this window" style="font-size:70%; font-weight:bold; line-height:1em; position:absolute; right:1px; top:1px; cursor:default">X</p>' +
      '<p title="Automatic text color detected isn\'t perfect, for example, an image that is 70% dark and has black text will be detected wrongly. Last used color will be bolded">Text color (override):</p>' +
      '<span title="Image has black/dark text on white/light background"><input type="radio" class="radiobutton group1" name="group1" value="1"/> Black</span>' +
      '<span title="Image has white/light text on black/dark background"><input type="radio" class="radiobutton group1" name="group1" value="2"/> White</span>' +
      '<span title="Auto-detect (not always 100% accurate)">             <input type="radio" class="radiobutton group1" name="group1" value="3" checked/> Detect</span>' +
      '' +
      '<div id="noteAssist_singleNoteSection">' +
      '' +
      '' +
      '<p style="text-align:center; font-size:90%; margin-bottom: 7px;" title="A set of buttons to apply HTML/CSS styling to either the selected text (or all text, if nothing is selected)">Text decoration functions</p>' +
      '<input type="button" id="noteAssist_textBold" value="Bold"                title="Toggle boldness"/> ' +
      '<input type="button" id="noteAssist_textItalic" value="Italic"            title="Toggle italics"/> ' +
      '<input type="button" id="noteAssist_textColor" value="Color"              title="Activates the built-in eyedropper tool, click/drag the image to select a color - hint, you can also select a color from the zoomed preview"/> ' +
      '<input type="button" id="noteAssist_textBackgroundColor" value="Bg-color" title="Activates the built-in eyedropper tool, click/drag the image to select a color - hint, you can also select a color from the zoomed preview"/>' +
      '<br/><input type="button" id="noteAssist_textSizePlus" value="size +"     title="Increase the font size"/> ' +
      '<input type="button" id="noteAssist_textSizeMinus" value="size -"         title="Decrease the font size"/> ' +
      '<input type="button" id="noteAssist_textTn" value="<tn>"                  title="Turns the selected text into a translation note, or adds the tags (empty) to the end of the text."/> ' +
      '' +
      '<p id="noteAssist_eyedropperHint" style="text-align:center; display:none">Eyedropper tool active</p>' +
      '' +
      '' +
      '</div>' + //end of single note section
      '' +
      '<div id="noteAssist_eyedropperSection"></div>' +
      '' +
      '' +
      //'<p style="text-align:center; color:#888888;" id="noteAssist_mouseoverInfo">more coming soon</p> '+
      '<a href="#" id="noteAssist_settings" style="font-size:80%; margin:-3px; display: block;">settings</a>' +
      '<a href="/forum_topics/9373">' + //footer
      '<img width="15" height="15" title="Click for more info, function details or help (forum)" alt="info"  style="position:absolute; bottom:1px; right:1px;" ' +
      'src="data:image/gif;base64,R0lGODlhDwAPAPMPAAAzmSpbqjF2yEZ5v0uK0Wqv6m/G/1aHw5TV/4rN+6ba/bPQ7bLg/vX4+tTp+JusxSH5BAAAAAAALAAAAAAPAA8AAASAsMm2iAiBLDclI8XmOAgxL' +
        'FOFMorCvMXwSATjsAQwKAhyDI5F4dbKERCJ3uFQc7QQvJ5BGRAQeUZDImEoYBoMKGIAECAMaEPZ2SuV091yIpwUAAhwQqBCT+QEaQ8BBw0DBQpbf2kYMwuGC1twFzMSggIgXReDHQ0OggCgAweUDREAOw" />' +
      '</a>' +
      '' +
      '' +
      '';


    document.body.appendChild(container);

    document.getElementById('noteAssist_generateAll').addEventListener('click', function () { NA.snap('full'); }, false);

    document.getElementById('noteAssist_closeMain').addEventListener('click', function () { document.getElementById('noteAssist_ui').style.display = 'none'; }, false);

    document.getElementById('noteAssist_textBold').addEventListener('mousedown', NA.styleNote.addCss, false);
    document.getElementById('noteAssist_textItalic').addEventListener('mousedown', NA.styleNote.addCss, false);
    document.getElementById('noteAssist_textColor').addEventListener('mousedown', NA.styleNote.eyedropper, false);
    document.getElementById('noteAssist_textBackgroundColor').addEventListener('mousedown', NA.styleNote.eyedropper, false);
    document.getElementById('noteAssist_textSizePlus').addEventListener('mousedown', NA.styleNote.addCss, false);
    document.getElementById('noteAssist_textSizeMinus').addEventListener('mousedown', NA.styleNote.addCss, false);
    document.getElementById('noteAssist_textTn').addEventListener('mousedown', NA.styleNote.addCss, false);

    document.getElementById('noteAssist_settings').addEventListener('click', NA.settingsMenuCreate, false);

};

//==========================================================
// Init script
//==========================================================

NA.initCore = function () {
    //======================================================================================
    // Load the settings from local storage (if any)
    //======================================================================================
    NA.initSettings();

    // numbers inputted in textfields are saved as strings, parse as needed
    NA.settings.forceEnd = parseInt(NA.settings.forceEnd, 10); // forceEnd = number


    //======================================================================================
    // Some global values
    //======================================================================================
    //var img = document.getElementById('image');

    // ghost notes css
    var style =
      'div#note-container .ghostNote .note-box-inner-border.unsaved { background-image:linear-gradient(-45deg, rgba(255, 0, 0, 0.7) 15%, transparent 15%, transparent 50%, rgba(255, 0, 0, 0.7) 50%, rgba(255, 0, 0, 0.7) 65%, transparent 65%, transparent); background-size:23px 23px;}' +
      'div#note-container .ghostNote.ui-state-disabled .note-box-inner-border.unsaved { background-image:none }' +
      '' +
      '';
    NA.addGlobalStyle(style);


    // debug elements & css
    if (NA.settings.debug) {
        //document.getElementById('sidebar').appendChild(NA.$c('input', { id: 'bwslider', type: 'range', min: 0, max: 255, step: 1, value: 190 })); //bw slider, changes last canvas white&black scale
        //document.getElementById('sidebar').appendChild(NA.$c('p', { id: 'bwsliderValue' }));
        //document.getElementById('bwslider').addEventListener('input', NA.debug.bwslider, false);

        document.getElementById('sidebar').appendChild(NA.$c('div', { id: 'debug_log' }));     // debug text
        NA.addGlobalStyle('#content canvas { margin-right:0.5em; margin-bottom:0.5em; }');     // debug images

    }


    //======================================================================================
    // Generate UI
    //======================================================================================
    NA.initUi();



    //======================================================================================
    // Hook into danbooru code
    //======================================================================================
    NA.danbooruHooks();




    //======================================================================================
    // Bind leftclick event on all notes that loaded before we hooked into danbooru code
    //======================================================================================
    var allNoteBoxes = document.getElementById('note-container').getElementsByClassName('note-box');

    for (var i = 0; i < allNoteBoxes.length; i++) {
        allNoteBoxes[i].addEventListener('click', NA.noteLeftclick, false);
    }

    //======================================================================================
    // debug, personal css
    //======================================================================================

    //NA.addGlobalStyle('body,#top,#nav,header#top menu,#page,#page-footer { background-color:#C4C4C4 !important; }' +
    //  '.post-count, .count { color:#888888!important; }' +
    //  'span.low-post-count { color:red!important; }' +
    //  '#nav-links { padding: 0.3em!important; margin:0.3em 0em!important; }' +
    //  'div#c-posts div.notice { margin-bottom: 0.3em !important; padding: 0em 0.5em !important; }' +
    //  '#upgrade-account-notice { display:none!important; }' +
    //  '' +
    //  '' +
    //  '' +
    //  '');
};


NA.injectJS = function () {
    if (typeof $ === 'function') {  //check if danbooru's javascript globals are accessible -> don't need to inject
        NA.initCore();
    }
    else { //put the userscript in the page so it can access danbooru's javascript (chrome/Firefox)
        var script = document.createElement('script');
        script.innerHTML = NA;
        script.innerHTML += 'NA.initCore();';

        document.body.appendChild(script);
        //console.log('noteAssist - appended JS');
    }
};


NA.loader = function () {
    if (document && (document.readyState == 'complete' || document.readyState == 'interactive')) {
        var img = document.getElementById('image');
        if (img) {
            NA.injectJS();
        }
    }
    else if (document) {
        document.addEventListener('DOMContentLoaded', NA.loader);
    }
    else { alert('NoteAssist - critical error, "document" was undefined at runtime'); }
};
NA.loader();




//===================================
// Script flow:
//===================================
// 1) script init
// wait until the page fully loaded (including image!)
// if chrome/firefox: put all code into a <script> tag and append to body so we can access danbooru code & jquery -- opera can skip this
// -Core init
//   initSettings: store all settings in "NA.settings", no matter if they are default or loaded
//   Add some ghost notes css
//   Global varible set: NA.globals.fitToScreenRatio
//   initUi: create the UI, append to body, bind buttons
//   danbooruHooks: custom code overwrites some danbooru functions so the script can activate on note creation / translation mode
// 
//
//
// 2) text detection code (NA.snap)
//  has several modes, see comments inside the function for more info (full image / single note / ...)
//  x/y/width/height: contains the coordinates of the selected area relative to the full image
//  The image is converted to black&white: convertToBlackWhite
//  Draw a 1px border around the image
//  Mark anything touching the border as background/noise
//  Get all groups of connected pixels, each is a "shape"
//
//  Connect shapes with other nearby** shapes into "shapeGroups" (see (3))
//
//  Create ghostNotes for all shapeGroups in Generate all mode, resize selected note otherwise
//
//
//
// 3) connect shapes logic (NA.connectShapes)
//       This function decides if a shape is a letter or not AND which shapegroup(text) it belongs to.
//       Unlike other functions which are based on facts (a pixel is white or black), this is mostly done by guessing as there are no real formula's
//
//  Sort the allShapes array from small to large (easier to filter extremes)
//  Get average shape size, ignoring the bottom 25% & top 15%
//  Delete any shapes larger than 10x the average (not letters, mostly entire textbubbles & pannels)
//  Merge all shapes that overlap (single letters with seperated parts)
//  Re-calculate average shape size
//  calculate:
//    connectedHorizontal & connectedVertical: average amount of whitespace between letters ->
//    connectHorizontalMax & connectVerticalMax = maximum distance between 2 letters before they are no longer counted as part of the same group
//  turn the shapes into shapeGroups, based on connectHorizontalMax & connectVerticalMax
//  shapeGroups cleanup:
//   - (Generate all mode): Delete shapeGroups with only 1-2 shapes
//   - (Generate all mode): Delete shapeGroups that have much smaller average shape size
//   - Delete shapeGroups that are too small (below 8x8px)
//   - shapeGroups close to other shapeGroups are merged (multiple lines in a single textbubble)
// 
// ** nearby is based on the average size of the shapes, as well as the average amount of distance between shapes



//===================================
// Failed optimizations:
//===================================
// * context.getImageData: loading parts of the image data at a time to cut spike memory 
//   -> Uint8ClampedArray is smallest array type (1 byte per value (0-255)), but is locked in size
//   -> Same problem with strings, they are also immutable
//
// * fillborder: putting the tar values in an array to get rid of the 7 extra "if()" calls
//    -> 25% slower after testing
//
// *Copy/pasted code: -> in loops that run several million times, it is faster to make 3 similar functions
//                    -> that each have their own goal, than to make 1 function with if/else and run that 3 times
//                    -> every function call also slows, thus inline code is prefered.
//    



//=======================
// Misc info
//=======================
// red channel   : stores the image shape itself (black=0 & white=255, which was split at luma:190)
//               : killMain sets temporary to 10, then 100 - findLines sets temporary to 10, then 20
// green channel : unused, contains original data from the color image (can be set to 0 in convertToBlackWhite function)
// blue channel  : unused, contains original data from the color image (can be set to 0 in convertToBlackWhite function)
//

//=======================
// known bugs (besides text being detected wrong):
//=======================
// none!


//=======================
//Things the script can't handle well:
//=======================
//* texts with more than 2 paragraphs might not be detected as a single text
//* Words that have 0 space between them, flow into eachother, or are connected by a line. -cannot fix-
//* Text on a transparent background -won't fix-
//* Light colored text on a light background / dark on dark -cannot fix- - Example: post #333297



//====================================
//TODO / bugfix / improvements:
//====================================
// Shading by dot pattern instead of gradient sometimes messes up detection and slows the script http://danbooru.donmai.us/posts/794002 (use full)
// right side, http://danbooru.donmai.us/posts/1559874 very little text between different bubbles, script merges all
// 
//
//minor: browser difference - eyedropper cursor doesn't show up on chrome/firefox
//minor: browser difference - inactive selected text isn't highlighted on chrome/firefox.
//
// try to implement better anti background-pattern system - related, max 3 jumps from smallLines.

//====================================
//will take a while / complicated:
//====================================
//tweak the formula to be more lenient with large fonts
//
//perf: dot patterns like http://danbooru.donmai.us/posts/794002 take 3+ sec ~ 25x as long as normal image


//====================================
//CRITICAL (must be fixed asap):
//====================================
//

//====================================
//non-critical:
//====================================
//idea: try out image sharpening code
//


//====================================
//DONE:
//====================================
// give some visual feedback what text color the script has detected - underline/bold on menu
// check danbooru js before replacing, report if the code is changed and thus needs to be updated
//random (short) text with high spacing between letters (top of image) - http://danbooru.donmai.us/posts/1357951
//improve: allow small noise to only start closeby letters instead of anywhere around the text border
//TODO: fix connectVertical / connectHorizontal
//idea:button selector for 'noteboxes on everything' - 'filter out small noise (<4)' - 'large texts only (<10)'
//improve: use average distances for connectDistances instead of based on size. (only if > 5 or > 8 letters?)
//improve: switch size detection to surface instead of px
//TODO: make sure snap doesn't go outside image borders
//words split by longer spaces, "..." or similar non-detected noise - http://danbooru.donmai.us/posts/824378
//multiple lines in a single textbubble, seperated by a large space - http://danbooru.donmai.us/posts/824378 (grant 1 jump?) (check if fully above/beside +/- few px?)
//implement ghost notes //idea: 'generate all notes' -> ghost notes, click to make semi-permanent, ghost notes not affected by save-all.
//'generate all' breaks on http://danbooru.donmai.us/posts/1145745
//perf: replace data.data with temp var
//fix: set ui top offset to fixed #px (jumps on http://danbooru.donmai.us/posts/1362314)
//write good warning/info about memory usage
//make debug fully disable-able
//remove textblobs that are 100% covered (as well as ones smaller then 10x10?)
//^^fix textblob jumping
//TODO: decide spaceing between text & note border on notes with samples
//    : (currently, spaced 5px on sample -> 5px*ratio on original -- spacing it 5px on original -> sticks very close to text on sample).
//pref: improve 'findLines' speed with concept of 'killmain'
// ! tweak canvases to reduce memory usage
// setting to change togrey on the fly?
// don't create ghost notes on top of already-saved notes
//
//
