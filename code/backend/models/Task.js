// Task model - this is the "shape" of one document in the MongoDB "tasks" collection.
const mongoose = require('mongoose');

const TAGS = ['Linux', 'Git', 'Docker', 'Kubernetes', 'AWS', 'CI/CD', 'Terraform', 'Monitoring', 'Other'];

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    tag: { type: String, enum: TAGS, default: 'Other' },
    done: { type: Boolean, default: false },
    // Which backend server created this task. Because every backend talks to the
    // SAME database, a task created by backend #1 is visible through backend #2.
    // That is what makes the backend "stateless" and safe to put behind a load balancer.
    createdOn: { type: String, default: 'unknown' },
  },
  { timestamps: true }
);

module.exports = { Task: mongoose.model('Task', taskSchema), TAGS };
