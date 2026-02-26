function getReports(req, res) {
  res.json({
    message: 'Reports data',
    user: req.user,
    data: [
      { id: 1, title: 'Monthly Sales', date: '2025-01' },
      { id: 2, title: 'Q1 Summary', date: '2025-Q1' },
      { id: 3, title: 'Annual Review', date: '2024' },
    ],
  });
}

function getProfile(req, res) {
  res.json({
    message: 'User profile',
    user: req.user,
  });
}

function getData(req, res) {
  res.json({
    message: 'Protected data',
    timestamp: new Date(),
    user: req.user,
  });
}

function postData(req, res) {
  res.status(201).json({
    message: 'Data created',
    payload: req.body,
    createdBy: req.user,
  });
}

module.exports = { getReports, getProfile, getData, postData };
