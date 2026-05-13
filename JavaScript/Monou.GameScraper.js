/*
// just on game load
Monou.GameScraper.Init("MyKey");
// on start game or match
Monou.GameScraper.Start();
// Each time the player accumulates points
// passes the added points, not the total score
Monou.GameScraper.Advance( addedPoints ); 
// on finish game passes total score
Monou.GameScraper.Advance( totalScore ); 
// for show a advertise
await Monou.GameScraper.Advertise();
// for show arvertise rewarded
// the flag returs boolean success or not
var playerSawTheAd = await Monou.GameScraper.AdvertiseRewarded();
// for sell products or dcl in your games
// the flag returs boolean success or not
var playerBoughtTheItem = await Monou.GameScraper.Sell( amount );
*/

if (typeof Monou == "undefined") var Monou = {};
Monou.GameScraper = (function () {

	var gameKey, onAdSuccess, onAddRewardSuccess, onSellSuccess, waiting = false, secure = false, canLog = false;

	async function generateSignature(secret, bodyStr) {
		const encoder = new TextEncoder();
		const key = await crypto.subtle.importKey(
			"raw", encoder.encode(secret),
			{ name: "HMAC", hash: "SHA-256" }, false, ["sign"]
		);
		const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(bodyStr));
		return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
	}

	const send = async (type, val) => {
		waiting = false;
		var parse_int = parseInt(val);
		const data = { key: gameKey, type: type, val: parse_int||0, str: (isNaN(parse_int) && val || "").toString() };
		const dataJSON = JSON.stringify(data);
		window.parent.postMessage(
			JSON.stringify({ hash: await generateSignature(gameKey, dataJSON), data: dataJSON }),
			"*"
		);
	}
	const forSuccess = () => {
		return new Promise((resolve) => {
			const interval = setInterval(() => {
				if (!waiting) return;
				clearInterval(interval);
				resolve(waiting.success);
			}, 100);
		});
	}

	window.addEventListener('message', async function (event) {
		const eventData = JSON.parse(event.data);
		const data = JSON.parse(eventData?.data);
		if (eventData.hash == "test") { waiting = data; canLog = true; secure = false; return; }
		if (eventData?.hash != await generateSignature(gameKey, eventData?.data)) return;
		switch (data.type) {
			case "ad": case "adReward": case "sell": waiting = data; secure = true; break;
			case "log": canLog = data.success; break;
		}
	});

	var mRec, canvas, canvasStream, specs,
		onMM = e => send("_scrapper_mm", (e => ["MOUSE_MOVE", [e.pageX, e.pageY].join(",")])(e.touches && e.touches[0] || e)),
		onMD = e => send("_scrapper_md", (e => ["MOUSE_BUTTON", [1, true, e.pageX, e.pageY].join(",")])(e.touches && e.touches[0] || e)),
		onMU = e => send("_scrapper_mu", ["MOUSE_BUTTON", [1, false].join(",")]),
		onKD = e => send("_scrapper_kd", ["KEYBOARD", [e.keyCode, true].join(",")]),
		onKU = e => send("_scrapper_ku", ["KEYBOARD", [e.keyCode, false].join(",")]);
	const start_log = async () => {
		canvas = document.getElementsByTagName('canvas')[0];
		canvasStream = canvas.captureStream(30);
		mRec = new MediaRecorder(canvasStream, { mimeType: "video/webm; codecs=vp8" });
		mRec.ondataavailable = (event) => {
			if (event.data.size > 0) {
				const reader = new FileReader();
				reader.onloadend = () => send("_scrapper_chunk", reader.result);
				reader.readAsDataURL(event.data);
			}
		};
		send("_scrapper_chunk_init");
		window.addEventListener("mousemove", onMM); window.addEventListener("touchmove", onMM);
		window.addEventListener("mousedown", onMD); window.addEventListener("touchstart", onMD);
		window.addEventListener("mouseup", onMU); window.addEventListener("touchend", onMU);
		window.addEventListener("keydown", onKD);
		window.addEventListener("keyup", onKU);
		mRec.start(100);
		specs = {
			"game_slug": "$game_slug",
			"game_resolution": [canvas.height, canvas.width],
			"hardware_specs": {
				"cpu": navigator?.hardwareConcurrency,
				"memory": navigator?.deviceMemory,
				"gpus": (navigator?.gpu?.requestAdapter && await navigator.gpu.requestAdapter())?.features?.size,
				"user_agent": navigator?.userAgent
			},
			"start_timestamp": Date.now(),
			"average_fps": 30
		};
	}
	const finish_log = () => {
		if(!mRec) return;
		mRec.stop();
		specs.end_timestamp = Date.now();
		specs.duration = specs.end_timestamp - specs.start_timestamp;
		send("_scrapper_chunk_finish", JSON.stringify(specs));
		canvasStream.getTracks().forEach(track => track.stop());
		canvasStream = canvas = mRec = mRec.onstop = mRec.ondataavailable = specs = null;
		window.removeEventListener("mousemove", onMM); window.removeEventListener("touchmove", onMM);
		window.removeEventListener("mousedown", onMD); window.removeEventListener("touchstart", onMD);
		window.removeEventListener("mouseup", onMU); window.removeEventListener("touchend", onMU);
		window.removeEventListener("keydown", onKD);
		window.removeEventListener("keyup", onKU);
	}

	return {
		Init: async (k) => {
			gameKey = k;
			if (document.readyState === 'complete') { await send("init", false); }
			else window.addEventListener('load',()=>setTimeout(async ()=>await send("init", false),100));
		},
		Send: async (k, v) => await send(k, v),
		Start: async () => { await send("start", false); canLog && start_log(); },
		Finish: async score => { await send("finish", score); finish_log(); },
		Advance: async delta => await send("advance", delta),
		Advertise: async () => {
			await send("ad", false);
			return await forSuccess();
		},
		AdvertiseRewarded: async () => {
			await send("adReward", false);
			return await forSuccess();
		},
		Sell: async amount => {
			await send("sell", amount);
			return await forSuccess();
		}
	}

})();

export default Monou.GameScraper;