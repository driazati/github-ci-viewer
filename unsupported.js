class UnsupportedItem {
	constructor(merge_status_item) {
		this.merge_status_item = merge_status_item;
		this.build = get_build(this.merge_status_item);
	}


	retry(callback) {
		console.error("Not supported");
	}

	getDisplay(callback) {
		let error = `${this.build.name} is not supported`;
		callback(get_text_display(error));
		return;
	}
}