export async function flightsHandler(req,res){
  const { from="MEX", to="CUN", date="2025-08-25" } = req.query;
  const mk=(id,code,dep,arr,price)=>({
    id, airline:code, airlineName:code,
    origin: from.toUpperCase(), destination: to.toUpperCase(),
    departureTime: `${date}T${dep}:00-05:00`,
    arrivalTime: `${date}T${arr}:00-05:00`,
    transfers: 0,
    price: { amount: price, currency: "MXN" },
    deeplink: `/search/${from}${to}?id=${id}`
  });
  res.json({ ok:true, results: [
    mk("1","VB","06:05","08:35",1432),
    mk("2","Y4","09:10","11:40",1599),
    mk("3","AM","16:05","18:30",1899)
  ]});
}
