'use strict';
const base64 = require('base-64');

function decodeCursor(cursor) {
  return cursor ? JSON.parse(base64.decode(cursor)) : null;
}

function encodeCursor(cursor) {
  return base64.encode(JSON.stringify(cursor));
}

function getPaginationQuery(cursor, cursorOrderOperator, paginationField, primaryKeyField) {
  if (paginationField !== primaryKeyField) {
    return {
      $or: [
        { 
          [paginationField]: {
            [cursorOrderOperator]: cursor[0],
          },
        },
        {
          [paginationField]: cursor[0],
          [primaryKeyField]: {
            [cursorOrderOperator]: cursor[1],
          },
        },
      ],
    };
  } else {
    return {
      [paginationField]: {
        [cursorOrderOperator]: cursor[0],
      },
    };
  }
}

function withPagination(options) {
  let methodName = options.methodName || 'paginate';
  let primaryKeyField = options.primaryKeyField || 'id';

  return model => {
    const paginate = function (options){
      //where, include, limit, before, after, desc, paginationField, raw, attributes
      let where = options.where || {};
      let include = options.include || [];
      let desc = options.desc || false;
      let paginationField = options.paginationField || primaryKeyField;
      let raw = options.raw || false;
      let attributes = options.attributes || [];
      let limit = options.limit;
      let before = options.before;
      let after = options.after;
      let subQuery = options.subQuery || false;

      const decodedBefore = !!before ? decodeCursor(before) : null;
      const decodedAfter = !!after ? decodeCursor(after) : null;
      const cursorOrderIsDesc = before ? !desc : desc;
      const cursorOrderOperator = cursorOrderIsDesc ? '$lt' : '$gt';
      const paginationFieldIsNonId = paginationField !== primaryKeyField;

      let paginationQuery;

      if (before) {
        paginationQuery = getPaginationQuery(decodedBefore, cursorOrderOperator, paginationField, primaryKeyField);
      } else if(after) {
        paginationQuery = getPaginationQuery(decodedAfter, cursorOrderOperator, paginationField, primaryKeyField);
      }

      const whereQuery = paginationQuery
        ? { $and: [paginationQuery, where] }
        : where;

      return model.findAll({
        attributes: attributes,
        where: whereQuery,
        include: include,
        limit: limit + 1,
        order: [
          cursorOrderIsDesc ? [paginationField, 'DESC'] : paginationField
        ],
        subQuery: subQuery,
        raw: raw
      }).then(results => {
        const hasMore = results.length > limit;
  
        if (hasMore) {
          results.pop();
        }

        if (before) {
          results.reverse();
        }
  
        const hasNext = !!before || hasMore;
        const hasPrevious = !!after || (!!before && hasMore);

        let beforeCursor = null;
        let afterCursor = null;

        if (results.length > 0) {
          beforeCursor = paginationFieldIsNonId 
            ? encodeCursor([results[0][paginationField], results[0][primaryKeyField]])
            : encodeCursor([results[0][paginationField]]);

          afterCursor = paginationFieldIsNonId
            ? encodeCursor([results[results.length - 1][paginationField], results[results.length - 1][primaryKeyField]])
            : encodeCursor([results[results.length - 1][paginationField]]);
        }

        return {
          results,
          cursors: {
            hasNext,
            hasPrevious,
            before: beforeCursor,
            after: afterCursor,
          },
        };
      });
    };
  
    model[methodName] = paginate;
  };
}

module.exports = withPagination;