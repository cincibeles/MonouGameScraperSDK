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

if( typeof Monou == "undefined") var Monou = {};
Monou.GameScraper = (function(){

	var gameKey, onAdSuccess, onAddRewardSuccess, onSellSuccess, waiting = false, secure = false;

	async function generateSignature(secret, bodyStr) {
	  const encoder = new TextEncoder();
	  const key = await crypto.subtle.importKey(
	    "raw",encoder.encode(secret),
	    { name: "HMAC", hash: "SHA-256" },false,["sign"]
	   );
	  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(bodyStr));
	  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
	}

	const send = async (type, val)=>{
		waiting = false;
		const data = {key:gameKey, type:type, val:val};
		const dataJSON = JSON.stringify(data);
		window.parent.postMessage(
			JSON.stringify({hash:await generateSignature(gameKey, dataJSON), data:dataJSON})
			//"https://monou.gg/"
		);
	}
	const forSuccess = ()=>{
		return new Promise((resolve) => {
			const interval = setInterval(()=>{
				if(!waiting) return;
				clearInterval(interval);
				resolve(waiting.success);
			},100);
		});
	}

	window.addEventListener('message', async function(event) {
		const eventData = JSON.parse(event.data);
		const data = JSON.parse(eventData?.data);
		if(eventData.hash == "test"){ waiting = data; secure=false; return; }
		if(eventData?.hash != await generateSignature(gameKey, eventData?.data)) return;
		switch(data.type){ case "ad": case "adReward": case "sell": waiting = data; secure=true; break; }
	});

	return {
		Init: async (k)=>{gameKey = k; await send("init", false); },
		Start: async ()=>await send("start", false),
		Finish: async score=>await send("finish", score),
		Advance: async delta=>await send("advance", delta),
		Advertise: async ()=>{
			await send("ad", false);
			await forSuccess();
		},
		AdvertiseRewarded: async ()=>{
			await send("adReward", false);
			return await forSuccess();
		},
		Sell: async amount=>{
			await send("sell", amount);
			return await forSuccess();
		}
	}

})();

export default Monou.GameScraper;