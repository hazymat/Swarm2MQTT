export const weeksText = days => days < 1 ? "less than a day" : days < 14 ? `${Math.round(days)} ${Math.round(days) === 1 ? "day" : "days"}` : `${Math.round(days / 7)} weeks`;
