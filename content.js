let token = undefined;
let repo = undefined;
let username = undefined;
let vcs = 'github';
let current_display = undefined;
let current_spinner = undefined;

chrome.storage.local.get('info', (items) => {
	token = items.info.token;
	username = items.info.username;
	repo = items.info.repo;
	log_lines = items.info.num_lines;
});

document.addEventListener('click', () => {

});

get_builds((builds) => {
	builds.forEach((build) => {
		// Add click event
		build.element.addEventListener('click', show_build.bind(build));
	});	
});

function get_builds(callback) {
	// spin until tests load
	const body = document.querySelector('div.branch-action-body');
	if (!body) {
		setTimeout(() => {
			get_builds(callback);
		}, 100);
		return;
	}
	let elements = body.querySelectorAll('.merge-status-item');
	body.querySelector('.merge-status-list').style['max-height'] = 'none';

	let builds = [];

	for (let i = 0; i < elements.length; i++) {
		let el = elements[i];
		builds.push({
			element: el,
			name: el.querySelector('strong').innerText,
			link: el.querySelector('.status-actions').href
		});
	}

	callback(builds);
}

function show_build() {
	this.id = get_build_id(this.link);

	clear_current_display();

	current_spinner = build_spinner(this);
	insert_after(this.element, current_spinner);

	fetch_log(this.id, token, (log, full_build_url, raw_log) => {
		if (current_display) {
			this.element.parentNode.removeChild(current_display);
		}
		if (current_spinner) {
			this.element.parentNode.removeChild(current_spinner);	
		}
		current_display = build_display(this, log, full_build_url, raw_log);
		insert_after(this.element, current_display);
	})
}

function insert_after(element, toInsert) {
	let next = element.nextSibling;
	if (next) {
		element.parentNode.insertBefore(toInsert, next);			
	} else {
		element.parentNode.insert(toInsert);						
	}
}

function escapeHtml(text) {
  return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
}

function build_display(build, log, full_build_url, raw_log) {
	let div = document.createElement("div");
	let a = document.createElement("button");
	a.appendChild(document.createTextNode("View full log"));
	div.appendChild(a);

	let a2 = document.createElement("button");
	a2.appendChild(document.createTextNode("Retry build"));
	div.appendChild(a2);


	let pre = document.createElement("pre");
	pre.appendChild(document.createTextNode(log));
	div.appendChild(pre);

	a.addEventListener('click', () => {
		pre.removeChild(pre.firstChild);
		pre.appendChild(document.createTextNode(process_log_all(raw_log)));
	});

	a2.addEventListener('click', () => {
		retry_build(build);
	});

	return div;
}

function clear_current_display() {
	if (current_display && current_display.previousSibling == this.element) {
		this.element.parentNode.removeChild(current_display);
		current_display = undefined;
		return;
	}
}

function retry_build(build) {
	request(build_retry_url(build.id), {
		method: "POST",
		success: clear_current_display
	});
}

function build_spinner(build) {
	let p = document.createElement("p");
	p.appendChild(document.createTextNode("Loading build " + build.id));
	return p;
}

function build_info_url(build_id) {
	return `https://circleci.com/api/v1.1/project/${vcs}/${username}/${repo}/${build_id}?circle-token=${token}`;
}

function build_retry_url(build_id) {
	return `https://circleci.com/api/v1.1/project/${vcs}/${username}/${repo}/${build_id}/ssh?circle-token=${token}`;
}

function nthFromEnd(str, pat, n) {
    let i = -1;
    let search_backward_from = str.length;
    while (n-- > 0) {
        i = str.lastIndexOf(pat, search_backward_from);
        search_backward_from = i - pat.length;
        if (search_backward_from < 0) {
        	break;
        }
    }
    return i;
}

function get_build_id(link) {
	return link.match(/\d+(?=\?)/g)[0];
}

function fetch_log(build_id, token, callback) {
	request(build_info_url(build_id, token), {
		success: (result) => {
			console.log(JSON.parse(result))
			let build_result = JSON.parse(result).steps[4];
			console.log(build_result);
			let url = build_result.actions[0].output_url;
			request(url, {
				success: (log) => {
					console.log("got", log.substring(0, 100));
					callback(process_log(log), url, log, build_result);
				}
			})
		}
	});
}

function process_log(raw) {
	let log = raw.replace(/\/r/, '');
	tail = log.substring(nthFromEnd(log, '\\n', log_lines));
	tail = tail.substring(tail.indexOf('\\n', tail.length) + 3);
	tail = tail.replace(/\\r\\n/g, '\n');
	tail = tail.replace(/(\\r)|(\\n)/g, '\n');
	return tail.replace(/\n\s*\n/g, '\n');
}

function process_log_all(raw) {
	console.log(raw);
	let log = raw.replace(/\/r/, '');
	tail = log.replace(/\\r\\n/g, '\n');
	tail = tail.replace(/(\\r)|(\\n)/g, '\n');
	return tail.replace(/\n\s*\n/g, '\n');
}

function empty() { }

function request(url, opts) {
	const method = opts.method || 'GET';
	const body = opts.body || {};
	const success = opts.success || empty;
	const error = opts.error || empty;

	const req = new XMLHttpRequest();

	req.open(method, url);
	req.setRequestHeader('Accept', 'application/json');
	req.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
	
	req.onreadystatechange = function() {
		if (req.readyState == 4) {
			if (req.status >= 200 && req.status < 300) {
				try {
					success(req.responseText);
				} catch (e) {
					error("Can't parse JSON: " + req.responseText);					
				}
			} else {
				error(req);
			}
		}
	}
	
	req.onerror = function() {
		error();
	};

	if (body) {
		req.send(JSON.stringify(body));
	} else {
		req.send();
	}
}