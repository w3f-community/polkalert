import 'reflect-metadata'
import { createConnection, Connection, EntityManager, LessThan } from 'typeorm'
import { Header } from '../entity/Header'
import { Validator } from '../entity/Validator'
import { CommissionData } from '../entity/CommissionData'
import { GraphQLError } from 'graphql'
import { formatBalance } from '@polkadot/util'
import { performance } from 'perf_hooks'
import { NodeInfoStorage } from '../entity/NodeInfoStorage'
import * as moment from 'moment'

let connection: Connection = null
let manager: EntityManager = null
let nodeInfo: NodeInfo = null
let validatorMap = {}

//TODO: Config
//number of seconds to prune blocks
let pruning = 180
//max number of hours for storing blocks
let maxDataAge = 24
//interval function
let pruningInterval = null

async function getValidator(hash) {
  if (!validatorMap[hash]) {
    validatorMap[hash] = await manager.findOne(Validator, hash)
  }
  return validatorMap[hash]
}

async function clearDB() {
  await connection.synchronize(true)
  await init()
  return
}

async function disconnect() {
  clearInterval(pruningInterval)
  await connection.close()
  validatorMap = {}
  manager = null
  nodeInfo = null
  return
}

async function getDataAge() {
  let firstHeader = await getFirstHeader()
  let lastHeader = await getLastHeader()
  return moment
    .duration(lastHeader.timestamp - firstHeader.timestamp)
    .humanize()
}

async function init() {
  if (connection) await disconnect()
  connection =
    (await createConnection().catch(error => console.log(error))) || null
  if (!connection) {
    throw new Error('Cannot create connection to database')
  }
  manager = connection.manager

  pruningInterval = setInterval(async () => {
    let lastHeader = await getLastHeader()
    if (manager && lastHeader)
      manager.delete(Header, {
        timestamp: LessThan(lastHeader.timestamp - maxDataAge * 3600 * 1000)
      })
  }, pruning * 1000)

  return
}

function normalizeNumber(number) {
  if (number && number.toNumber) number = number.toNumber()
  return number
}

function normalizeHash(hash) {
  if (hash && hash.toString) hash = hash.toString()
  return hash
}

function createNominatorObjectString(nominatorData) {
  if (!nominatorData || !nominatorData.others.length) return null

  const nominatorObject = {
    totalStake: formatBalance(nominatorData.total),
    nominatorStake: formatBalance(
      nominatorData.total.unwrap().sub(nominatorData.own.unwrap())
    ),
    stakers: nominatorData.others.map(staker => {
      return {
        accountId: normalizeHash(staker.who),
        stake: formatBalance(staker.value)
      }
    })
  }

  return JSON.stringify(nominatorObject)
}

async function removeComissionObject(data) {
  const commissionData = await manager.find(CommissionData, {
    relations: ['validator'],
    where: {
      validator: {
        accountId: normalizeHash(data.accountId)
      },
      sessionIndex: data.sessionIndex
    }
  })

  //TODO look if transaction:true is needed
  await manager
    .remove(commissionData, {
      transaction: true
    })
    .catch(e => console.log('Error removing commissionData'))

  return
}

function createCommissionObject(data) {
  const commissionData = new CommissionData()

  commissionData.eraIndex = normalizeNumber(data.eraIndex)
  commissionData.sessionIndex = normalizeNumber(data.sessionIndex)

  commissionData.bondedSelf = data.stakingLedger
    ? formatBalance(data.stakingLedger.total)
    : undefined

  commissionData.commission = data.validatorPrefs
    ? formatBalance(data.validatorPrefs.validatorPayment)
    : undefined

  commissionData.controllerId = normalizeHash(data.controllerId)
  commissionData.nominatorData = createNominatorObjectString(data.stakers)

  commissionData.sessionId = normalizeHash(data.sessionId)
  commissionData.nextSessionId = normalizeHash(data.nextSessionId)
  commissionData.sessionIds = data.sessionIds
    ? JSON.stringify(
        data.sessionIds.map(id => {
          return normalizeHash(id)
        })
      )
    : undefined
  commissionData.nextSessionIds = data.nextSessionIds
    ? JSON.stringify(
        data.nextSessionIds.map(id => {
          return normalizeHash(id)
        })
      )
    : undefined

  return commissionData
}

function createValidatorObject(data) {
  const validator = new Validator()
  validator.accountId = normalizeHash(data.accountId)
  return validator
}

function createHeaderObject(data) {
  const header = new Header()
  header.id = normalizeNumber(data.number)
  header.timestamp = data.timestamp
  header.blockHash = normalizeHash(data.hash)
  return header
}

async function save(type, data) {
  if (type === 'Validator') {
    let validator: Validator = await manager.findOne(
      Validator,
      normalizeHash(data.accountId)
    )

    if (validator) {
      await removeComissionObject(data)
    } else {
      validator = createValidatorObject(data)
    }

    let commission: CommissionData = createCommissionObject(data)
    commission.validator = validator

    await manager.save(validator)
    await manager.save(commission)

    return
  }

  if (type === 'Header') {
    const validator: Validator = await getValidator(normalizeHash(data.author))
    let header = await manager.findOne(Header, normalizeNumber(data.number))

    if (!header) header = createHeaderObject(data)

    header.validator = validator
    await manager.save(header)

    return
  }
  throw new Error('Tried to save unknown entity')
}

async function bulkSave(type, data) {
  //TODO Make faster
  console.log('DB: bulk saving', data.length, type + 's')
  let performanceStart = performance.now()
  for (let dataIndex = 0; dataIndex < data.length; dataIndex++) {
    await save(type, data[dataIndex])
  }

  console.log(
    'DB: bulk saving finished:Performance',
    performance.now() - performanceStart,
    'ms'
  )
  return
}

async function getValidatorInfo(id) {
  if (connection) {
    return await manager.findOne(Validator, id, {
      relations: ['commissionData', 'blocksProduced']
    })
  } else {
    throw new GraphQLError('not connected to any node')
  }
}

async function getFirstHeader() {
  return await manager.findOne(Header, null, { order: { id: 'ASC' } })
}

async function getLastHeader() {
  return await manager.findOne(Header, null, { order: { id: 'DESC' } })
}

async function getValidators() {
  if (connection) {
    console.log('DB: getting all validators')
    let performanceStart = performance.now()
    let allValidators: Validator[] = await manager.find(Validator, {
      relations: ['commissionData', 'blocksProduced']
    })

    //TODO look into performance with query countRelationAndMap
    allValidators = allValidators.map(validator => {
      validator.blocksProducedCount = validator.blocksProduced.length
      return validator
    })

    console.log(
      'DB: got all validators:Performance',
      performance.now() - performanceStart,
      'ms'
    )
    return allValidators
  } else {
    throw new GraphQLError('not connected to any node')
  }
}

async function setNodeInfo(newNodeInfo: NodeInfo) {
  nodeInfo = newNodeInfo

  formatBalance.setDefaults({
    decimals: nodeInfo.tokenDecimals,
    unit: nodeInfo.tokenSymbol
  })

  const nodeInfoStorage =
    (await manager.findOne(NodeInfoStorage, 1)) || new NodeInfoStorage()

  nodeInfoStorage.data = JSON.stringify(nodeInfo)
  nodeInfoStorage.id = 1

  await manager.save(nodeInfoStorage)

  return
}

async function getNodeInfo(): Promise<NodeInfo> {
  let oldNodeInfo = await manager.findOne(NodeInfoStorage, 1)
  if (oldNodeInfo) {
    return JSON.parse(oldNodeInfo.data)
  } else return null
}

export default {
  init,
  save,
  setNodeInfo,
  getNodeInfo,
  getDataAge,
  clearDB,
  getFirstHeader,
  getLastHeader,
  bulkSave,
  getValidators,
  getValidatorInfo
}