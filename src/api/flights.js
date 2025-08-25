export async function flightsHandler(req,res){
  const { from="MEX", to="CUN", date="2025-08-25" } = req.query;
  res.json({ ok:true, results: [
    { id:"1", airline:"VB", airlineName:"VB", origin:from, destination:to,
      departureTime:`${date}T16:05:00-05:00`, arrivalTime:`${date}T18:35:00-05:00`,
      transfers:0, price:{ amount:1432, currency:"MXN" }, deeplink:`/search/${from}${to}?id=1` },
    { id:"2", airline:"Y4", airlineName:"Y4", origin:from, destination:to,
      departureTime:`${date}T07:15:00-05:00`, arrivalTime:`${date}T09:45:00-05:00`,
      transfers:0, price:{ amount:1599, currency:"MXN" }, deeplink:`/search/${from}${to}?id=2` }
  ]});
}
