const { triggerRealtimeMetricsUpdate } = require("../controllers/dashboard.controller");

const updateDashboardMetricsPostResponse = (req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300 && req.user?._id) {
        const userIdString = req.user._id.toString();
      triggerRealtimeMetricsUpdate(userIdString);
    }
  });
  next();
};

module.exports = { updateDashboardMetricsPostResponse };