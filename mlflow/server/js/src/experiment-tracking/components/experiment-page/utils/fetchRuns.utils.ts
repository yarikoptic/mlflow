import { isEqual } from 'lodash';
import { ATTRIBUTE_COLUMN_SORT_KEY } from '../../../constants';
import { ViewType } from '../../../sdk/MlflowEnums';
import { LIFECYCLE_FILTER } from '../../../types';
import { SearchExperimentRunsFacetsState } from '../models/SearchExperimentRunsFacetsState';

const START_TIME_COLUMN_OFFSET = {
  ALL: null,
  LAST_HOUR: 1 * 60 * 60 * 1000,
  LAST_24_HOURS: 24 * 60 * 60 * 1000,
  LAST_7_DAYS: 7 * 24 * 60 * 60 * 1000,
  LAST_30_DAYS: 30 * 24 * 60 * 60 * 1000,
  LAST_YEAR: 12 * 30 * 24 * 60 * 60 * 1000,
};

/**
 * This function checks if the sort+model state update has
 * been updated enough and if the change should invoke re-fetching
 * the runs from the back-end. This enables differentiation between
 * front-end and back-end filtering.
 */
export const shouldRefetchRuns = (
  currentSearchFacetsState: SearchExperimentRunsFacetsState,
  newSearchFacetsState: SearchExperimentRunsFacetsState,
) =>
  !isEqual(currentSearchFacetsState.searchFilter, newSearchFacetsState.searchFilter) ||
  !isEqual(currentSearchFacetsState.orderByAsc, newSearchFacetsState.orderByAsc) ||
  !isEqual(currentSearchFacetsState.orderByKey, newSearchFacetsState.orderByKey) ||
  !isEqual(currentSearchFacetsState.lifecycleFilter, newSearchFacetsState.lifecycleFilter) ||
  !isEqual(currentSearchFacetsState.startTime, newSearchFacetsState.startTime);

/**
 * Creates "order by" SQL expression
 */
const createOrderByExpression = ({ orderByKey, orderByAsc }: SearchExperimentRunsFacetsState) => {
  if (orderByKey) {
    return orderByAsc ? [orderByKey + ' ASC'] : [orderByKey + ' DESC'];
  }
  return [];
};

/**
 * Creates SQL expression for filtering by run start time
 */
const createStartTimeExpression = (
  { startTime }: SearchExperimentRunsFacetsState,
  referenceTime: number,
) => {
  const offset = START_TIME_COLUMN_OFFSET[startTime as keyof typeof START_TIME_COLUMN_OFFSET];
  if (!startTime || !offset || startTime === 'ALL') {
    return null;
  }
  const startTimeOffset = referenceTime - offset;

  return `attributes.start_time >= ${startTimeOffset}`;
};

/**
 * Combines search filter and start time SQL expressions
 */
const createFilterExpression = (
  { searchFilter }: SearchExperimentRunsFacetsState,
  startTimeExpression: string | null,
) => {
  if (searchFilter && startTimeExpression) {
    return `${searchFilter} and ${startTimeExpression}`;
  } else if (!searchFilter && startTimeExpression) {
    return startTimeExpression;
  } else {
    return searchFilter || undefined;
  }
};

/**
 * If this function returns true, the ExperimentView should nest children underneath their parents
 * and fetch all root level parents of visible runs. If this function returns false, the views will
 * not nest children or fetch any additional parents. Will always return true if the orderByKey is
 * 'attributes.start_time'
 */
const shouldNestChildrenAndFetchParents = ({
  orderByKey,
  searchFilter,
}: SearchExperimentRunsFacetsState) =>
  (!orderByKey && !searchFilter) || orderByKey === ATTRIBUTE_COLUMN_SORT_KEY.DATE;

/**
 *
 * Function creates API-compatible query object basing on the given criteria.
 * @param experimentIds IDs of experiments to be queries for runs
 * @param searchFacetsState the sort/filter model to use
 * @param referenceTime reference time to calculate startTime filter
 * @param pageToken next page token if fetching the next page
 */
export const createSearchRunsParams = (
  experimentIds: (number | string)[],
  searchFacetsState: SearchExperimentRunsFacetsState,
  referenceTime: number,
  pageToken?: string,
) => {
  const runViewType =
    searchFacetsState.lifecycleFilter === LIFECYCLE_FILTER.ACTIVE
      ? ViewType.ACTIVE_ONLY
      : ViewType.DELETED_ONLY;

  const orderBy = createOrderByExpression(searchFacetsState);
  const startTimeExpression = createStartTimeExpression(searchFacetsState, referenceTime);
  const filter = createFilterExpression(searchFacetsState, startTimeExpression);
  const shouldFetchParents = shouldNestChildrenAndFetchParents(searchFacetsState);

  return {
    // Experiment IDs
    experimentIds,

    // Filters and sort options
    filter,
    runViewType,
    orderBy,
    shouldFetchParents,

    // Next page token for loading more runs
    pageToken,
  };
};
