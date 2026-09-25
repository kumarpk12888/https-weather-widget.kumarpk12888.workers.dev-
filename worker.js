export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const city = url.searchParams.get("city");
    const lat = url.searchParams.get("lat");
    const lon = url.searchParams.get("lon");

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate"
    };

    try {
      const apiKey = env.OPENWEATHER_API_KEY;

      if (!apiKey) {
        return new Response(JSON.stringify({
          error: "API key set nahi hai Worker mein"
        }), { status: 500, headers });
      }

      let weatherUrl, forecastUrl;
      if (lat && lon) {
        weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
        forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;
      } else {
        const cityName = city || "Delhi";
        weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cityName)}&units=metric&appid=${apiKey}`;
        forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(cityName)}&units=metric&appid=${apiKey}`;
      }

      const weatherRes = await fetch(weatherUrl);
      const data = await weatherRes.json();

      if (data.cod != 200) {
        return new Response(JSON.stringify({
          error: "API se error aaya",
          cod: data.cod,
          message: data.message
        }), { status: 404, headers });
      }

      function formatLocalTime(unixSeconds, tzOffsetSeconds) {
        const d = new Date((unixSeconds + tzOffsetSeconds) * 1000);
        let hours = d.getUTCHours();
        const minutes = d.getUTCMinutes().toString().padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12;
        if (hours === 0) hours = 12;
        return `${hours}:${minutes} ${ampm}`;
      }

      function degToCompass(deg) {
        const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
        const index = Math.round(deg / 22.5) % 16;
        return directions[index];
      }

      function conditionEmoji(condition) {
        const map = {
          Clear: "☀️", Clouds: "☁️", Rain: "🌧️", Drizzle: "🌧️",
          Thunderstorm: "⛈️", Snow: "❄️", Mist: "🌫️", Haze: "🌫️",
          Fog: "🌫️", Smoke: "🌫️"
        };
        return map[condition] || "🌡️";
      }

      // AQI
      let aqiValue = null, aqiLabel = null, pm25 = null;
      try {
        const aqiRes = await fetch(
          `https://api.openweathermap.org/data/2.5/air_pollution?lat=${data.coord.lat}&lon=${data.coord.lon}&appid=${apiKey}`
        );
        const aqiData = await aqiRes.json();
        if (aqiData.list && aqiData.list[0]) {
          aqiValue = aqiData.list[0].main.aqi;
          pm25 = Math.round(aqiData.list[0].components.pm2_5);
          const labels = { 1: "Good", 2: "Fair", 3: "Moderate", 4: "Poor", 5: "Very Poor" };
          aqiLabel = labels[aqiValue] || "N/A";
        }
      } catch (e) {}

      // 5-din ka forecast (3-ghante ke intervals, free tier)
      let forecast5day = [];
      let hourlyNext = [];
      try {
        const forecastRes = await fetch(forecastUrl);
        const forecastData = await forecastRes.json();

        if (forecastData.list) {
          // Agle 8 slots (24 ghante, har 3 ghante mein ek) = "hourly" jaisa view
          hourlyNext = forecastData.list.slice(0, 8).map(item => {
            const timeLabel = formatLocalTime(item.dt, data.timezone);
            return {
              time: timeLabel,
              temp: Math.round(item.main.temp),
              emoji: conditionEmoji(item.weather[0].main)
            };
          });

          // Din ke hisaab se group karke min/max nikalna (5 din)
          const dayMap = {};
          forecastData.list.forEach(item => {
            const dateObj = new Date((item.dt + data.timezone) * 1000);
            const dayKey = dateObj.toISOString().split("T")[0];
            if (!dayMap[dayKey]) {
              dayMap[dayKey] = { temps: [], conditions: [], dateObj };
            }
            dayMap[dayKey].temps.push(item.main.temp);
            dayMap[dayKey].conditions.push(item.weather[0].main);
          });

          const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          forecast5day = Object.keys(dayMap).slice(0, 5).map(key => {
            const entry = dayMap[key];
            const min = Math.round(Math.min(...entry.temps));
            const max = Math.round(Math.max(...entry.temps));
            // Sabse zyada baar aane wali condition ko din ki condition maano
            const freq = {};
            entry.conditions.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
            const mainCondition = Object.keys(freq).reduce((a, b) => freq[a] > freq[b] ? a : b);
            return {
              day: dayNames[entry.dateObj.getUTCDay()],
              min,
              max,
              emoji: conditionEmoji(mainCondition)
            };
          });
        }
      } catch (e) {
        // Forecast fail ho toh bhi current weather return karo
      }

      const result = {
        city: data.name,
        country: data.sys.country,
        temp: Math.round(data.main.temp),
        temp_min: Math.round(data.main.temp_min),
        temp_max: Math.round(data.main.temp_max),
        feels_like: Math.round(data.main.feels_like),
        condition: data.weather[0].main,
        description: data.weather[0].description,
        icon: `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`,
        humidity: data.main.humidity,
        pressure: data.main.pressure,
        wind_speed: data.wind.speed,
        wind_dir: data.wind.deg != null ? degToCompass(data.wind.deg) : "N/A",
        clouds: data.clouds.all,
        visibility_km: (data.visibility / 1000).toFixed(1),
        local_time: formatLocalTime(data.dt, data.timezone),
        sunrise: formatLocalTime(data.sys.sunrise, data.timezone),
        sunset: formatLocalTime(data.sys.sunset, data.timezone),
        aqi: aqiValue,
        aqi_label: aqiLabel,
        pm25: pm25,
        hourly: hourlyNext,
        forecast5day: forecast5day,
        timezone: data.timezone,
        updated_at: new Date().toISOString()
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
