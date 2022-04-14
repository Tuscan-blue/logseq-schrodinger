import "@logseq/libs";
import {
  PageEntity,
  BlockEntity,
  SettingSchemaDesc,
} from "@logseq/libs/dist/LSPlugin";
import JSZip, { file } from "jszip";
import { saveAs } from "file-saver";
export var blocks2 = [];
import React from "react";
import ReactDOM from "react-dom";
import App from "./App";
import { handleClosePopup } from "./handleClosePopup";
import { path } from "./index";
var errorTracker = [];
var zip = new JSZip();
var imageTracker = [];
export async function getAllPublicPages() {
  errorTracker = [];
  logseq.DB.q("[:find (pull ?p [*]) :where [?p :block/properties ?pr] [(get ?pr :public) ?t] [(= true ?t)]]").then((result) => {
    const mappedResults = result.map((page) => {
      return page.name;
    });
    for (const x in mappedResults) {
      if (x != `${mappedResults.length - 1}`) {
        getBlocksInPage({ page: mappedResults[x] }, false, false);
      } else {
        getBlocksInPage({ page: mappedResults[x] }, false, true);
      }
    }
  });
}
export async function getBlocksInPage(
  e,
  singleFile,
  isLast,
  tagsArray = [],
  dateArray = [],
  titleDetails = [],
  categoriesArray = []
) {
  // async function createExport2() {
  let txt = "";
  const curPage = await logseq.Editor.getPage(e.page);
  const docTree = await logseq.Editor.getPageBlocksTree(curPage.originalName);

  //page meta-data
  let finalString = `---`;
  let propertiesList = [];
  if (curPage.properties != undefined) {
    propertiesList = curPage.properties;
  }
  if (tagsArray != []) {
    let formattedTagsArray = [];
    for (const tag in tagsArray) {
      formattedTagsArray.push(tagsArray[tag].tags);
    }
    if (propertiesList.tags != undefined) {
      for (const tag in formattedTagsArray) {
        propertiesList.tags.push(formattedTagsArray[tag]);
      }
    } else {
      propertiesList.tags = formattedTagsArray;
    }
  }
  if (categoriesArray != []) {
    let formattedCategoriesArray = [];
    for (const category in categoriesArray) {
      formattedCategoriesArray.push(categoriesArray[category].category);
    }
    if (propertiesList.categories != undefined) {
      for (const category in formattedCategoriesArray) {
        propertiesList.categories.push(formattedCategoriesArray[category]);
      }
    } else {
      propertiesList.categories = formattedCategoriesArray;
    }
  }

  let emptyArray = [];
  if (dateArray == emptyArray) {
    console.log("equal");
  }
  if (dateArray.length > 0) {
    console.log("Not equal");
    propertiesList.date = dateArray[1].originalDate;
    propertiesList.lastMod = dateArray[0].updatedDate;
  }
  if (titleDetails.length > 0) {
    propertiesList.title = titleDetails[0].noteName;
    propertiesList.fileName = titleDetails[1].hugoFileName;
  }
  for (const prop in propertiesList) {
    let pvalue = propertiesList[prop];
    finalString = `${finalString}\n${prop}:`;
    //FIXME ugly
    if (Array.isArray(pvalue)) {
      for (const key in pvalue) {
        finalString = `${finalString}\n- ${pvalue[key].replaceAll("[[", "")}`;
      }
    } else {
      if (pvalue === "category") pvalue = "categories";
      if (pvalue in ["categories", "tags"]) txt = "\n-";
      finalString = `${finalString}${txt} ${pvalue}`;
      
    }
  }
  console.log(finalString)
  finalString = `${finalString}\n---`;

  // parse page-content
  finalString = await parsePage(finalString, docTree);

  if (errorTracker.length > 0) {
  }
  if (singleFile) {
    logseq.hideMainUI();
    handleClosePopup();

    download(`${propertiesList.fileName}.md`, finalString);
  } else {
    zip.file(`${curPage.originalName}.md`, finalString);

    if (isLast) {
      setTimeout(() => {
        console.log(zip);
        zip.generateAsync({ type: "blob" }).then(function (content) {
          // see FileSaver.js
          saveAs(content, "publicExport.zip");
          //wait one second
          // setTimeout(() => {
          //   saveAs(content, "publicExport.zip");
          // }, 1000);
          zip = new JSZip();
        });
      }, imageTracker.length * 58);
    }
  }
}

async function parsePage(finalString: string, docTree) {
  for (const x in docTree) {
    // skip meta-data
    if (!(parseInt(x) === 0 && docTree[x].level === 1)) {
      finalString = `${finalString}\n${await parseText(docTree[x])}`;
      if (docTree[x].children.length > 0)
        finalString = await parsePage(finalString, docTree[x].children);
    }
  }
  return finalString;
}

async function parseText(block: BlockEntity) {
  let re: RegExp;
  let text = block.content;
  // console.log("block", block)
  let txtBefore: string = "";
  let txtAfter: string = "\n";
  const prevBlock: BlockEntity = await logseq.Editor.getBlock(block.left.id, {
    includeChildren: false,
  });

  //Get regex to check if text contains a md image
  const reImage = /!\[.*?\]\((.*?)\)/g  
  try {
    text.match(reImage).forEach((element) => {
      element.match(/(?<=!\[.*\])(.*)/g).forEach((match) => {
        let finalLink = match.substring(1, match.length - 1);
        // return (match.substring(1, match.length - 1))
        text = text.replace(match, match.toLowerCase());
        if (!finalLink.includes("http")|| !finalLink.includes(".pdf")) {
          text = text.replace("../", "/");
          imageTracker.push(finalLink);
          addImageToZip(finalLink);
        }
      });
    });
  } catch (error) {}
  // Add indention — level zero is stripped of "-", rest are lists
  // Experiment, no more lists, unless + or numbers
  // (unless they're not)
  // if (block.level > 1) {
  //   txtBefore = " ".repeat((block.level - 1) * 2) + "+ ";
  //   // txtBefore = "\n" + txtBefore
  //   if (prevBlock.level === block.level) txtAfter = "";
  // }
  if (prevBlock.level === block.level) txtAfter = "";
  //exceptions (logseq has "-" before every block, Hugo doesn't)
  if (text.substring(0, 3) === "```") txtBefore = "";
  // Don't - indent images
  if (reImage.test(text)) txtBefore = "";
  //indent text + add newline after block
  text = txtBefore + text + txtAfter;

  //conversion of links to hugo syntax https://gohugo.io/content-management/cross-references/
  if (logseq.settings.linkFormat == "Hugo Format") {
    text = await text.replaceAll(/\[\[.*?\]\]/g, async (match) => {
      const txt = match.substring(2, match.length - 2);
      if ((await logseq.Editor.getPage(txt)) != null) {
        return `[${txt}]({{< ref ${txt.replaceAll(" ", "_")} >}})`;
      } else {
        errorTracker.push(
          `${txt} is not a valid page name, will be converted from link to text`
        );
        return txt;
      }
    });
  }
  if (logseq.settings.linkFormat == "Without brackets") {
    text = text.replaceAll("[[", "");
    text = text.replaceAll("]]", "");
  }

  re = /#\+BEGIN_([A-Z]*).*\n(.*)\n#\+END_.*/gm;
  text = text.replace(re, "{{< logseq/org$1 >}}$2{{< / logseq/org$1 >}}");
  // text = text.toLowerCase();

  text = text.replace(/:LOGBOOK:|collapsed:: true/gi, "");
  if (text.includes("CLOCK: [")) {
    text = text.substring(0, text.indexOf("CLOCK: ["));
  }

  const rxGetId = /\(\(([^)]*)\)\)/;
  const blockId = rxGetId.exec(text);
  if (blockId != null) {
    const block = await logseq.Editor.getBlock(blockId[1], {
      includeChildren: true,
    });

    if (block != null) {
      text = text.replace(
        `((${blockId[1]}))`,
        block.content.substring(0, block.content.indexOf("id::"))
      );
    }
  }

  if (text.indexOf(`\nid:: `) === -1) {
    return text;
  } else {
    return text.substring(0, text.indexOf(`\nid:: `));
  }
}
function getBase64Image(img) {
  var canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  var ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  var dataURL = canvas.toDataURL("image/png");
  return dataURL.replace(/^data:image\/(png|jpg);base64,/, "");
}

function addImageToZip(filePath) {
  var element = document.createElement("img");
  let formattedFilePath = filePath.replace("..", path);
  element.setAttribute("src", formattedFilePath);
  element.style.display = "none";

  document.body.appendChild(element);
  setTimeout(() => {
      var base64 = getBase64Image(element);
      document.body.removeChild(element);
      if (base64 != "data:,") {
        zip.file(
          "assets/" +
            filePath.split("/")[filePath.split("/").length - 1].toLowerCase(),
          base64,
          { base64: true }
        );
      }
      else{
        console.log(base64)
      }
        
  }, 50);
}

//FIXME don't get it, but it works
function download(filename, text) {
  // console.log("DB:download", filename, text)
  var element = document.createElement("a");
  element.setAttribute(
    "href",
    "data:text/plain;charset=utf-8," + encodeURIComponent(text)
  );
  // element.setAttribute('download', filename);
  element.setAttribute("download", filename);

  element.style.display = "none";
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}
//Conversions to be handled
//1. DONE Convert page properties
//2. Remove bullets and indentation ???? in progress
//3. DONE Translate links from [[Logseq export]] should be translated as `[Logseq export]({{< ref "Logseq_export" >}})`
//4. Convert to .orig file
