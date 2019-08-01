chrome.runtime.onMessage.addListener(
function(request, sender, sendResponse) {
	if (request.ci_viewer_url) {
		console.log(fetch);
	  fetch(request.ci_viewer_url, request.options)
	      .then(response => {
	      		response.text().then(x => {
		      		sendResponse(x);
	      		});
	      	})
	      .catch(error => { console.log(error)});
	  return true;
	}
});