export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const city = url.searchParams.get("city") || "Delhi";

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json"
    };

    try {
      const apiKey = env.OPENWEATHER_API_KEY;

      if (!apiKey) {
        return new Response(JSON.stringify({
          error: "API key set nahi hai Worker mein"
        }), { status: 500, headers });
      }

      const weatherRes = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${apiKey}`
      );

      const data = await weatherRes.json();

      if (data.cod != 200) {
        return new Response(JSON.stringify({
          error: "API se error aaya",
          cod: data.cod,
          message: data.message
        }), { status: 404, headers });
      }

      const result = {
        city: data.name,
        country: data.sys.country,
        temp: Math.round(data.main.temp),
        feels_like: Math.round(data.main.feels_like),
        condition: data.weather[0].main,
        description: data.weather[0].description,
        icon: `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`,
        humidity: data.main.humidity,
        wind_speed: data.wind.speed
      };

      return new Response(JSON.stringify(result), { headers });

    } catch (err) {
      return new Response(JSON.stringify({
        error: "Worker mein exception aaya",
        details: err.message
      }), { status: 500, headers });
    }
  }
};
