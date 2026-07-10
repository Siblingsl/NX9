(function() {
  'use strict';
  const timeline = window.__NX9_TIMELINE__;
  if (!timeline || !timeline.clips) return;

  const stage = document.getElementById('stage');
  const videoStack = document.getElementById('video-stack');
  const subtitleLayer = document.getElementById('subtitle-layer');
  const fps = timeline.fps || 30;
  const durationSec = timeline.durationSec || 0;

  stage.dataset.duration = durationSec;

  // 创建 video/img 元素
  const clipElements = [];
  timeline.clips.forEach(function(clip, i) {
    if (clip.type !== 'video' && clip.type !== 'image') return;
    var el;
    if (clip.type === 'video') {
      el = document.createElement('video');
      el.src = clip.assetUrl;
      el.muted = true;
      el.loop = false;
    } else {
      el = document.createElement('img');
      el.src = clip.assetUrl;
    }
    el.dataset.start = clip.startSec;
    el.dataset.duration = clip.durationSec;
    el.dataset.index = i;
    videoStack.appendChild(el);
    clipElements.push(el);
  });

  // 创建字幕元素
  timeline.clips.forEach(function(clip) {
    if (clip.type !== 'subtitle' || !clip.text) return;
    var el = document.createElement('div');
    el.className = 'hf-subtitle';
    el.textContent = clip.text;
    el.dataset.start = clip.startSec;
    el.dataset.duration = clip.durationSec;
    subtitleLayer.appendChild(el);
  });

  // 时间线驱动
  var currentIndex = -1;
  var currentSubIndex = -1;

  function update(timeSec) {
    // 视频/图片切换
    var newIndex = -1;
    clipElements.forEach(function(el, i) {
      var start = parseFloat(el.dataset.start);
      var dur = parseFloat(el.dataset.duration);
      var active = timeSec >= start && timeSec < start + dur;
      el.classList.toggle('active', active);
      if (active) {
        newIndex = i;
        if (el.tagName === 'VIDEO' && currentIndex !== i) {
          el.currentTime = timeSec - start;
          el.play().catch(function(){});
        }
      } else if (el.tagName === 'VIDEO') {
        el.pause();
      }
    });
    currentIndex = newIndex;

    // 字幕切换
    var subtitles = subtitleLayer.querySelectorAll('.hf-subtitle');
    subtitles.forEach(function(el) {
      var start = parseFloat(el.dataset.start);
      var dur = parseFloat(el.dataset.duration);
      el.classList.toggle('active', timeSec >= start && timeSec < start + dur);
    });
  }

  // 暴露给 HyperFrames 渲染引擎
  window.__HF_UPDATE__ = update;
  window.__HF_DURATION__ = durationSec;
  window.__HF_FPS__ = fps;
})();
