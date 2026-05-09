// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessManager} from "@openzeppelin/contracts/access/manager/AccessManager.sol";

contract MarketPayAuthority is AccessManager {
    uint64 public constant TREASURY_ROLE = 1;     
    uint64 public constant PAUSER_ROLE = 2;
    uint64 public constant TOKEN_MANAGER_ROLE = 3;
    constructor (address initialAdmin) AccessManager(initialAdmin){}
}