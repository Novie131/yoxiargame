/*
 * 優先顯示無障礙路線。
 *
 * 對推嬰兒車、拉行李、行動不便的人來說，「哪個出口有電梯」比路線快兩分鐘
 * 重要得多，而現在的路線規劃對這些人來說是不完整的。
 *
 * 放在 user_preferences 而不是 commute_routes：這是關於「這個人」的事，
 * 不是關於某一條路線的。存在路線上的話，他每設一條新路線就要再勾一次。
 *
 * 預設 false 是刻意的。預設開啟會讓每個人的路線卡都多一段用不到的資訊，
 * 而那段資訊對真正需要的人來說必須是顯眼的 —— 到處都是就等於沒有。
 */
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS accessibility_priority boolean NOT NULL DEFAULT false;
