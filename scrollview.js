// A scrollable HTML element that automatically paginates so the browser doesn't
// have to do huge repaints

class ScrollView {
	// text: entire string that can be shown
	// formatter: a function that processes chunks of `text` and returns the result
	constructor(text, formatter) {
		this.text = text;
		this.formatter = formatter;
		this.lines = 100;
		this.pagination = 100;

		this.visible_text = nFromEnd(text, '\n', this.lines);

		this.disable_scroll_events = false;
	}

	_style() {
		this.div.style['white-space'] = 'pre';
		this.div.style['font-family'] = '"Lucida Console", Monaco, monospace';
		this.div.style['overflow'] = 'scroll';
		this.div.style['max-height'] = '80em';
		this.div.classList.add('log_viewer');
	}

	_onScroll() {
		if (this.disable_scroll_events) {
			return;
		}

		// Near the top, load some more content to keep scrolling
		if (this.div.scrollTop <= 200) {
			let old_scroll_height = this.div.scrollHeight;
			this.lines += this.pagination;
			this.visible_text = nFromEnd(this.text, '\n', this.lines);

			this.div.innerHTML = this.visible_text;
			this.div.scrollTop = this.div.scrollHeight - old_scroll_height;
		}
	}

	grep(regex_text) {
		if (regex_text === '') {
			// No regex provided, go back to original log
			this.lines = 100;
			this.visible_text = nFromEnd(this.text, '\n', this.lines);
			let old_scroll_height = this.div.scrollHeight;
			this.div.innerHTML = this.visible_text;
			if (this.div.scrollHeight != old_scroll_height) {
				this.div.scrollTop = this.div.scrollHeight - old_scroll_height;
			}
			this.disable_scroll_events = false;
			return;
		}

		// Check each line of the full log to see if it matches,
		// if so add it and display it
		const lines = this.text.split("\n");
		const regex = new RegExp(regex_text);
		let out_lines = [];
		for (let i = 0; i < lines.length; i++) {
			if (regex.test(lines[i])) {
				out_lines.push(`${i}: ${lines[i]}`);
			}
		}
		let grepped_text = out_lines.join("\n");

		// Removing the existing text node and replace it with a
		// new one			
		this.div.innerHTML = grepped_text;

		this.div.scrollTop = this.div.scrollHeight;

		// Don't load more content on scrolling up, the entire thing is shown
		this.disable_scroll_events = true;
	}

	element() {
		this.div = document.createElement("div");

		this._style();
		this.div.innerHTML = this.visible_text;
		this.div.onscroll = () => { this._onScroll(); };

		// When this element is added to the document, scroll to the bottom
		// (apparently this only works when the element is shown)
		this.observer = new MutationObserver((mutations) => {
			if (document.contains(this.div)) {
				this.div.scrollTop = this.div.scrollHeight
				this.observer.disconnect();
			}
		});
		this.observer.observe(document, {attributes: false, childList: true, characterData: false, subtree:true});

		return this.div;
	}
}