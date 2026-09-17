/**
 * UTILITY: FILTER OBJECT
 * Creates a new object containing only the allowed fields from the source object.
 * Useful for filtering req.body to prevent users from updating sensitive fields (like 'role').
 * 
 * @param {Object} obj - The source object to filter.
 * @param {...string} allowedFields - List of keys to keep in the new object.
 * @returns {Object} - The filtered object.
 */
const filterObject = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

module.exports = filterObject;
