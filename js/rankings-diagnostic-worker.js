importScripts('./rankings-engine.js');

self.onmessage = function(event) {
  const {
    gameData,
    system,
    mode,
    startDate,
    endDate,
    playerId,
    weights,
    fixedNormalizationRanges,
    setIds
  } = event.data;

  const impacts = {};
  let index = 0;

  function processNext() {
    try {
      if (index >= setIds.length) {
        self.postMessage({ type: 'done', impacts, completed: index });
        return;
      }

      const setId = String(setIds[index]);
      const withoutSetData = {
        ...gameData,
        sets: (gameData.sets || []).filter(set => String(set.setId) !== setId)
      };
      const result = new self.ClientRankingEngine(withoutSetData).calculate(
        system,
        mode,
        startDate,
        endDate,
        playerId,
        weights,
        fixedNormalizationRanges
      );
      const player = result.rankings?.find(row => String(row.playerId) === String(playerId));
      impacts[setId] = player?.scoreExact ?? player?.score ?? null;
      index++;
      self.postMessage({ type: 'progress', completed: index });
      setTimeout(processNext, 0);
    } catch (error) {
      self.postMessage({ type: 'error', message: error && error.message ? error.message : String(error) });
    }
  }

  processNext();
};
