// app.js for giusgiand/nvc-proxy on GitHub
// NB: this version requires installing http-proxy-middleware@3.0.0-beta.1

const express = require('express');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const fetch = require('cross-fetch');

const PORT = 3000;
const HOST = '127.0.0.1';  // NB: don't use "localhost" on Node version >= 17
const TARGET_URL = "https://giusgiand.altervista.org/share";
const SERVICE_URL = "https://juliusnic.altervista.org/public/getFacebookMetaByPropertyId.json";

// a Python-like format method to replace multiple occurrences of {} placeholders:
// myString.format("foo", "bar", "baz") returns a new string 
// where the 1st occurence of {} is replaced by foo, the 2nd by bar, and the 3rd by baz
String.prototype.format = function() {
   let i = 0;
   const args = Array.from(arguments);  // convert the arguments object to an array
   // use String.replace to iterate over the string in search of the {} placeholder pattern
   return this.replace(/\{\}/g, function(match) {                                        // at each match
      // replace the placeholder with the corresponding value from the args array, if such a value exists
      return (typeof args[i] !== 'undefined') ? (args[i++]) : (match);         // else leave it unchanged
   });
};

// returns a string derived from the html argument by replacing the "" value of the content attribute
// in the og:x meta tags with the corresponding values of url, title, description and image arguments
function replaceTags(html, url, title, description, image) {
   
   const urlToReplace = '<meta property="og:url" content="{}">'.format(url);
   const titleToReplace = '<meta property="og:title" content="{}">'.format(title);
   const descriptionToReplace = '<meta property="og:description" content="{}">'.format(description);
   const imageToReplace = '<meta property="og:image" content="{}">'.format(image);
 
   let htmlModified = "";
   htmlModified = html.replace('<meta property="og:url" content="">', urlToReplace);
   htmlModified = htmlModified.replace('<meta property="og:title" content="">', titleToReplace);
   htmlModified = htmlModified.replace('<meta property="og:description" content="">', descriptionToReplace);
   htmlModified = htmlModified.replace('<meta property="og:image" content="">',imageToReplace);
    
   return htmlModified;
    
};  // end replaceTags

const app = express();

const proxyOptions = {
   target: TARGET_URL,
   changeOrigin: true,
   followRedirects: true,
   selfHandleResponse: true,
   on: {
      proxyRes: responseInterceptor(metasResponseInterceptor)  // NB: v3 syntax
   }
};

async function metasResponseInterceptor(responseBuffer, proxyRes, req, res) {
   
   const contentType = proxyRes.headers['content-type'];
   const isHtml = (contentType) ? (contentType.includes('text/html')) : false;
   
   if ( !isHtml ) {
      console.log("[PRO] Returning something NOT HTML: this shouldn't have happened!"); 
      return responseBuffer;
   }
   
   // access the SpringBoot service to get the meta data for the property specified in the path
   const incomingPath = req.originalUrl;              // for example: /propertytoshare/48
   const propertyId = incomingPath.split("/")[2];     // in the example above: 48
   const json = await getFacebookMetaByPropertyId(propertyId);
   let result = json["result"];
   let url;
   let title;
   let description;
   let image;
   if ( result === "OK" ) {
       url = json.jsonData["url"];
       title = json.jsonData["title"];
       description = json.jsonData["description"];
       image = json.jsonData["image"];
   } else {
      console.log("[PRO] Invoking the SpringBoot service failed!");
      return responseBuffer;
   }
   
   // modify the response with the meta data obtained by SpringBoot and return it
   const response = responseBuffer.toString('utf8');
   const responseModified = replaceTags(response, url, title, description, image);
   console.log("[PRO] Response modified = " + "\n" + responseModified);
   console.log("[PRO] Returning some HTML");      
   return responseModified;
   
} // end metasResponseInterceptor

// returns the object provided by the SpringBoot service, {} in case of bad response
async function getFacebookMetaByPropertyId(id) {
   try {
      const res = await fetch(SERVICE_URL + "?propertyId=" + id);
      if (res.status >= 400) {
         throw new Error("Bad response from service! Status: " + res.status);
      }
      const jsonObject = await res.json();
      return jsonObject;
   } catch (err) {
      console.log("[PRO] ERROR = " + err);
      return {};
   }
}  // end getFacebookMetaByPropertyId

const proxy = createProxyMiddleware(proxyOptions);

app.use('/', (req, res, next) => {
   const incomingPath = req.originalUrl;  // for example: /propertytoshare/48
   console.log("[EXP] Path of incoming Request = " + incomingPath);
   // if an incoming path exists
   if ( !!incomingPath ) {
      // proxy the incoming request
      proxy(req, res, next);
   }
});

app.listen(PORT, HOST, () => {
    console.log("[EXP] Proxy started at " + HOST + ":" + PORT);
});
 
/***********************************************************************************************************/




