export async function placesHandler(req,res){
  res.json([
    {"id":"MEX","code":"MEX","name":"Benito Juárez Intl","city":"Mexico City","country":"Mexico","type":"airport"},
    {"id":"CUN","code":"CUN","name":"Cancún Intl","city":"Cancún","country":"Mexico","type":"airport"}
  ]);
}
