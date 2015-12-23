/***
 Author{Xiao Yuguang}
 Purpose{
	analyze element context in a html string
}
 tagHeader:
 information object about open/self_close/close tag or textnode
 eg. <cms> / <cms/> / </cms> / "\n abc\n"
 tagHeader format:
 {   //attributes:
     string: the tag string ("<div class='a'>")
     startIndex: tag start index in xhtml string,
     endIndex: tag end index in xhtml string,
     length: tag string length,
     tagName: tag name ("div"),
     tagType: tag type (TAG_TYPE.OPEN),
     attrs: attrs contained in tag ({class: 'a'})
     tagSeq: list index in tagHeaderList(list of tagHeader) built, starts from 0
     prevTag: previous tag in tagHeaderList built
     nextTag: next tag in tagHeaderList built
     matchTag: matched tag in tagHeaderList (eg. <div> and </div>; self_close tag will be itself)
     parentTag: parent tag in tagHeaderList
  }
 tagHeader api:
 ...
 ***/
var JsLibs = {};
(function($){
    if(!jQuery){
        return;
    }
    //static variables
    var TAG_TYPE = Constants.TAG_TYPE;
    var selfCloseTag = /<([\w:]+)[^>]*\/>/ig;
    var openTag = /<([\w:]+)([^\/>]|\/(?!>))*>/ig;
    var closeTag = /<\/([\w:]+)\s*>/ig;
    var ALL_TAG_REGEX = new RegExp(selfCloseTag.source + "|" + openTag.source + "|" + closeTag.source, "ig");
    //index of regex result group for tag name
    var tagStringIndex = 0, selfCloseTagNameIndex = 1, openTagNameIndex = 2, closeTagNameIndex = 4;

    //variables
    var storedHtml = null;
    var tagHeaderList = [];

    JsLibs.getElementContextInHtml = getElementContextInHtml;

    function isCached(html){
        return storedHtml && storedHtml == html;
    }

    JsLibs.buildTagHeaderList = function(html){
        if(isCached(html)){
            return tagHeaderList;
        }
        var token;
        var tagHeaderList_tmp = [];
        var stack = [];
        var i = 0;
        var processedPoint = -1;
        while((token = ALL_TAG_REGEX.exec(html)) != null){
            var tagHeader = getTagHeaderInfo(token);
            var previousTag = tagHeaderList_tmp.length ? tagHeaderList_tmp[tagHeaderList_tmp.length - 1] : null;
            var previousEndIndex = previousTag ? previousTag.endIndex : -1;
            var tagHeaderPrevTag = previousTag;
            var previousTagNextTag = tagHeader;
            //create text node if text exists between current tag and previous tag
            if(tagHeader.startIndex - previousEndIndex > 1){
                var textNode = buildTextNode(html, previousEndIndex + 1, tagHeader.startIndex - 1);
                tagHeaderPrevTag = textNode;
                previousTagNextTag = textNode;
                textNode.tagSeq = i;
                textNode.prevTag = previousTag;
                textNode.nextTag = tagHeader;
                textNode.matchTag = textNode;
                textNode.parentTag = stack.slice(-1)[0]; //last element from stack
                tagHeaderList_tmp.push(textNode);
                i += 1;
            }
            if(previousTag){
                previousTag.nextTag = previousTagNextTag;
            }
            tagHeader.tagSeq = i;
            tagHeader.prevTag = tagHeaderPrevTag;
            tagHeader.nextTag = null;
            tagHeader.parentTag = stack.slice(-1)[0]; //last element from stack
            if(tagHeader.tagType == TAG_TYPE.SELF_CLOSE){
                tagHeader.matchTag = tagHeader;
            }
            else if(tagHeader.tagType == TAG_TYPE.OPEN){
                stack.push(tagHeader);
            }
            else{
                //close tag
                if(stack.length){
                    var matchedTag = stack.pop();
                    tagHeader.matchTag = matchedTag;
                    matchedTag.matchTag = tagHeader;
                    tagHeader.parentTag = matchedTag.parentTag;
                }
                else{
                    tagHeaderList_tmp.hasParseError = true;
                }
            }
            tagHeaderList_tmp.push(tagHeader);
            i += 1;
            processedPoint = tagHeader.endIndex;
        }
        //additional text process
        var lastTagHeader = tagHeaderList_tmp.slice(-1)[0];
        if(processedPoint < html.length - 1){
            var lastTextNode = buildTextNode(html, processedPoint + 1, html.length - 1);
            lastTextNode.tagSeq = i;
            lastTextNode.prevTag = lastTagHeader;
            if(lastTagHeader){
                lastTagHeader.nextTag = lastTextNode;
            }
            lastTextNode.matchTag = lastTextNode;
            lastTextNode.parentTag = null;
            tagHeaderList_tmp.push(lastTextNode);
        }
        //structure check
        if(stack.length){
            tagHeaderList_tmp.hasParseError = true;
        }
        tagHeaderList = tagHeaderList_tmp;
        return tagHeaderList_tmp;
    };

    /*
     pass in tag header(open/close/selfClose)
     return whether index is inside tag's body (between tag and matched tag but not inside header) (false for selfClose tag)
     */
    function isInsideTagBody(tagHeader, index){
        var startIndex, endIndex;
        if(tagHeader.tagType == TAG_TYPE.SELF_CLOSE){
            return false;
        }
        else if(tagHeader.tagType == TAG_TYPE.OPEN){
            startIndex = tagHeader.endIndex;
            endIndex = tagHeader.matchTag.startIndex;
        }
        else if(tagHeader.tagType == TAG_TYPE.CLOSE){
            startIndex = tagHeader.matchTag.endIndex;
            endIndex = tagHeader.startIndex;
        }
        else{
            return false;
        }
        return (index > startIndex && index <= endIndex);
    }

    function getTagHeaderInfo(token){
        var string = token[tagStringIndex];
        var tagType = -1;
        var tagName = "";
        if(token[selfCloseTagNameIndex]){
            tagType = TAG_TYPE.SELF_CLOSE;
            tagName = token[selfCloseTagNameIndex];
        }
        else if(token[openTagNameIndex]){
            tagType = TAG_TYPE.OPEN;
            tagName = token[openTagNameIndex];
        }
        else if(token[closeTagNameIndex]){
            tagType = TAG_TYPE.CLOSE;
            tagName = token[closeTagNameIndex];
        }
        return new TagHeader({
            string: string,
            startIndex: token.index,
            endIndex: token.index + string.length - 1,
            tagName: tagName,
            tagType: tagType,
            attrs: buildTagAttrs(string)
        });
    }

    function buildTagAttrs(string){
        var attrs = {};
        if($(string).length){
            $.each($(string)[0].attributes, function(){
                attrs[this.name] = this.value;
            });
        }
        return attrs;
    }

    //include start, include end
    function buildTextNode(html, start, end){
        return new TagHeader({
            string: html.substring(start, end + 1),
            startIndex: start,
            endIndex: end,
            tagName: "TextNode",
            tagType: TAG_TYPE.SELF_CLOSE,
            attrs: {}
        });
    }

    function TagHeader(param){
        var vm = this;
        vm.string = param.string;
        vm.startIndex = param.startIndex;
        vm.endIndex = param.endIndex;
        vm.length = vm.endIndex - vm.startIndex + 1;
        vm.tagName = param.tagName;
        vm.tagType = param.tagType;
        vm.attrs = param.attrs || {};
    }

    TagHeader.prototype.isEmptyTextNode = function () {
        var vm = this;
        return vm.tagName == "TextNode" && !/[^\s\n]+/.test(vm.string);
    };

    TagHeader.prototype.getWholeTagIndexRange = function () {
        var vm = this;
        return {
            startIndex: vm.startIndex,
            endIndex: vm.tagType == TAG_TYPE.OPEN ? vm.matchTag.endIndex : vm.endIndex
        };
    };

    //check a tag has empty nodes around it (before and after), and return empty node after it if has
    JsLibs.hasExtraEmptyNode = function(tagHeader){
        var previousTag = tagHeader.prevTag;
        var tagHeaderEnd = tagHeader.tagType == TAG_TYPE.OPEN ? tagHeader.matchTag : tagHeader;
        var nextTag = tagHeaderEnd.nextTag;
        if( (previousTag == null || previousTag.isEmptyTextNode())
            && (nextTag == null || nextTag.isEmptyTextNode()) ){
            return nextTag;
        }
        else{
            return null;
        }
    };

    JsLibs.getChildrenIndexListOfTag = function(tagHeaderList, targetIndex){
        var childrenIndexList = [];
        var start, end;
        if(targetIndex < 0 || targetIndex >= tagHeaderList.length){
            //get children of root
            start = 0;
            end = tagHeaderList.length - 1;
        }
        else{
            start = tagHeaderList[targetIndex].tagSeq + 1;
            end = tagHeaderList[targetIndex].matchTag.tagSeq - 1;
        }
        for(var i = start; i <= end; i++){
            var currentTag = tagHeaderList[i];
            if(currentTag.isEmptyTextNode()){
                continue;
            }
            if(currentTag.tagType == TAG_TYPE.SELF_CLOSE){
                childrenIndexList.push(i);
            }
            else if(currentTag.tagType == TAG_TYPE.OPEN){
                childrenIndexList.push(i);
                i = currentTag.matchTag.tagSeq;
            }
            else{
                //close tag; incorrect structure
            }
        }
        return childrenIndexList;
    };

    TagHeader.prototype.getTagWholeText = function () {
        var vm = this;
        var startTag = vm.tagType == TAG_TYPE.CLOSE ? vm.matchTag : vm;
        var endTag = vm.tagType == TAG_TYPE.CLOSE ? vm : vm.matchTag;
        var text = startTag.string;
        while(startTag != endTag){
            startTag = startTag.nextTag;
            text += startTag.string;
        }
        return text;
    };

    //if a tag is adjacent with another while ignoring empty text node between
    //if identical, return true also
    TagHeader.prototype.isAdjacentBefore = function(nextTag){
        var vm = this;
        if(!nextTag || vm.tagSeq > nextTag.tagSeq){
            return false;
        }
        var distance = nextTag.tagSeq - vm.tagSeq;
        var between = vm;
        for(var i = 0; i < distance - 1; i++){
            between = between.nextTag;
            if(!between.isEmptyTextNode()){
                return false;
            }
        }
        return true;
    };

    //get xpath ignore empty node
    TagHeader.prototype.getTagXPath = function(){
        var vm = this;
        var pathArray = [];
        var current = vm;
        do{
            var nthChild = 0;
            var startIndex = current.parentTag == null ? 0 : current.parentTag.tagSeq + 1;
            for(var i = startIndex; i < current.tagSeq; i++){
                var prevSibling = current.traverseTag(i);
                if(!prevSibling.isEmptyTextNode()){
                    nthChild += 1;
                    if(prevSibling.tagType == TAG_TYPE.OPEN){
                        i = prevSibling.matchTag.tagSeq;
                    }
                }
            }
            pathArray.splice(0, 0, nthChild);
            current = current.parentTag;
        }while(current);
        return pathArray;
    };

    TagHeader.prototype.traverseTag = function(tagSeq){
        var vm = this;
        var targetTag = vm;
        var traverseMethod = (vm.tagSeq > tagSeq) ? "prevTag" : "nextTag";
        while(targetTag && targetTag.tagSeq != tagSeq){
            targetTag = targetTag[traverseMethod];
        }
        return targetTag;
    };

})(jQuery);